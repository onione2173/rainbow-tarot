// orderId(PETAROT_{uuid-하이픈제거}_{timestamp})에서 reading_history UUID 복원.
// NicePay orderId는 영숫자/언더스코어만 안전하므로 하이픈을 제거해 인코딩하고 여기서 복원한다.
function ridFromOrderId(orderId) {
  const m = /^PETAROT_([0-9a-fA-F]{32})_/.exec(orderId || '');
  if (!m) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// 승인 성공 시: reading_history 레코드를 '결제 완료'로 확정하고 tid를 스냅샷에 기록한 뒤,
// 백그라운드 리포트 생성을 서버에서 직접 트리거한다(클라이언트 복귀 실패와 무관하게 완결).
// SUPABASE env가 없으면(아직 미설정) 경고만 남기고 기존 동작(리다이렉트)을 유지한다.
async function confirmAndTrigger(readingId, tid, event) {
  if (!readingId) return;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.warn('nicepay-confirm: SUPABASE env 미설정 — 레코드 확정/트리거 건너뜀 (결제 승인은 정상)');
    return;
  }
  const sbHeaders = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  };

  // reading_history에는 tid 전용 컬럼이 없다 → tid는 full_reading 스냅샷 안에만 기록한다.
  // (top-level 미존재 컬럼을 PATCH하면 PostgREST가 요청 전체를 거부해 status 갱신까지 실패함)
  // 결제가 확정됐으므로 보관 기간을 넉넉히 연장(생성 지연 시 마이페이지에서 조기 소멸 방지).
  let snapFields = {
    status: '결제 완료',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  try {
    const getRes = await fetch(
      `${supabaseUrl}/rest/v1/reading_history?id=eq.${readingId}&select=full_reading`,
      { headers: sbHeaders }
    );
    const rows = await getRes.json();
    if (Array.isArray(rows) && rows[0] && rows[0].full_reading) {
      const snap = JSON.parse(rows[0].full_reading);
      snap.tid = tid;
      snap._paidPending = true;
      snapFields.full_reading = JSON.stringify(snap);
    }
  } catch (e) {
    console.error('nicepay-confirm: 스냅샷 tid 병합 실패(계속 진행)', e);
  }

  try {
    await fetch(`${supabaseUrl}/rest/v1/reading_history?id=eq.${readingId}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify(snapFields),
    });
  } catch (e) {
    console.error('nicepay-confirm: 레코드 확정 PATCH 실패(결제 승인은 정상)', e);
  }

  // 백그라운드 리포트 생성 트리거 (응답 대기 최소화)
  try {
    const base = process.env.URL || (event.headers && `https://${event.headers.host}`);
    if (base) {
      await fetch(`${base}/.netlify/functions/deep-tarot-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readingId, tid }),
      });
    }
  } catch (e) {
    console.error('nicepay-confirm: 백그라운드 트리거 실패(클라이언트가 재트리거 가능)', e);
  }
}

exports.handler = async (event) => {
  // NicePay 서버승인: POST body (form-urlencoded) 또는 GET 쿼리파라미터 모두 처리
  let p = { ...(event.queryStringParameters || {}) };
  if (event.body) {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString()
      : event.body;
    try {
      new URLSearchParams(raw).forEach((v, k) => { p[k] = v; });
    } catch {}
  }

  const { authResultCode, authResultMsg, tid, orderId, amount } = p;

  const fail = (msg) => ({
    statusCode: 302,
    headers: { Location: `/deep-reading/?payment=fail&msg=${encodeURIComponent(msg)}` },
    body: '',
  });

  if (authResultCode !== '0000') {
    return fail(authResultMsg || '결제 인증 실패');
  }

  // 결제 금액 검증: 클라이언트가 넘긴 amount를 그대로 신뢰하지 않고
  // 서버가 정한 고정 금액과 일치할 때만 승인 진행 (금액 조작 결제 우회 차단)
  const EXPECTED_AMOUNT = Number(process.env.DEEP_READING_PRICE) || 1500;
  if (Number(amount) !== EXPECTED_AMOUNT) {
    return fail('결제 금액이 올바르지 않습니다.');
  }

  const clientId = process.env.NICEPAY_CLIENT_KEY;
  const secretKey = process.env.NICEPAY_SECRET_KEY;
  if (!clientId || !secretKey) return fail('서버 설정 오류');

  const isSandbox = process.env.NICEPAY_SANDBOX === 'true';
  const apiBase = isSandbox
    ? 'https://sandbox-api.nicepay.co.kr'
    : 'https://api.nicepay.co.kr';

  const auth = Buffer.from(`${clientId}:${secretKey}`).toString('base64');

  try {
    const res = await fetch(`${apiBase}/v1/payments/${tid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ amount: EXPECTED_AMOUNT }),
    });
    const data = await res.json();

    if (data.resultCode === '0000' && Number(data.amount) === EXPECTED_AMOUNT) {
      // 결제 확정: 레코드를 '결제 완료'로 갱신하고 서버에서 리포트 생성을 직접 트리거.
      // (실패해도 결제 승인 자체는 정상 반환 — 리다이렉트 유지)
      const readingId = ridFromOrderId(orderId);
      await confirmAndTrigger(readingId, tid, event);
      return {
        statusCode: 302,
        headers: {
          Location: `/deep-reading/?paid=true&tid=${encodeURIComponent(tid)}&orderId=${encodeURIComponent(orderId)}`,
        },
        body: '',
      };
    }
    return fail(data.resultMsg || '결제 승인 실패');
  } catch (e) {
    return fail('서버 오류');
  }
};
