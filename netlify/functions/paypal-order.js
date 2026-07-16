// PayPal 결제(영어판 USD 2.99 / 일본판 JPY 400) 서버 오케스트레이션.
// 한국판 NicePay 흐름(선기록→서버승인→background 트리거)을 PayPal Orders API v2로 확장한다.
//
// action:
//   'config'  → 프런트가 PayPal JS SDK를 동적 로드하기 위한 client-id/sandbox 반환 (시크릿 노출 없음)
//   'create'  → readingId·locale 기준 서버 고정 금액으로 주문 생성, custom_id=readingId. {orderID} 반환
//   'capture' → 주문 캡처 후 서버 검증(COMPLETED·금액·통화·custom_id) 통과 시
//               reading_history '결제 완료' 확정 + 스냅샷 병합 + deep-tarot-background 직접 트리거
//
// 금액은 클라이언트 입력을 신뢰하지 않고 아래 PRICES 표로만 확정한다(금액 위조 결제 차단).

// locale → 서버 고정가 (JPY는 소수점 불가)
const PRICES = {
  en: { currency_code: 'USD', value: '2.99' },
  ja: { currency_code: 'JPY', value: '400' },
};

function paypalBase() {
  return process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

// client_credentials로 매 호출 토큰 발급 (소규모 트래픽 — 캐시 불필요)
async function paypalToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return null;
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  try {
    const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// 캡처 성공 시: reading_history를 '결제 완료'로 확정하고 tid/orderID/payProvider를 스냅샷에 병합한 뒤,
// 서버에서 리포트 생성(background)을 직접 트리거한다. (nicepay-confirm의 confirmAndTrigger 이식)
async function confirmAndTrigger(readingId, orderID, captureId, locale, event) {
  if (!readingId) return;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.warn('paypal-order: SUPABASE env 미설정 — 레코드 확정/트리거 건너뜀 (결제 캡처는 정상)');
    return;
  }
  const sbHeaders = {
    'Content-Type': 'application/json',
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };

  // 결제 확정 → 보관기간 넉넉히 연장(생성 지연 시 조기 소멸 방지). tid/orderID는 스냅샷에만 기록.
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
      snap.tid = captureId;
      snap.orderID = orderID;
      snap.payProvider = 'paypal';
      snap.locale = snap.locale || locale;
      snap._paidPending = true;
      snapFields.full_reading = JSON.stringify(snap);
    }
  } catch (e) {
    console.error('paypal-order: 스냅샷 병합 실패(계속 진행)', e);
  }

  try {
    await fetch(`${supabaseUrl}/rest/v1/reading_history?id=eq.${readingId}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(snapFields),
    });
  } catch (e) {
    console.error('paypal-order: 레코드 확정 PATCH 실패(결제 캡처는 정상)', e);
  }

  try {
    const base = process.env.URL || (event.headers && `https://${event.headers.host}`);
    if (base) {
      await fetch(`${base}/.netlify/functions/deep-tarot-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readingId }),
      });
    }
  } catch (e) {
    console.error('paypal-order: 백그라운드 트리거 실패(클라이언트가 재트리거 가능)', e);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return json(405, { error: 'method_not_allowed' });
  }

  // config는 GET/POST 모두 허용(SDK 동적 로드용)
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch {}
  }
  const action = body.action || (event.queryStringParameters && event.queryStringParameters.action);

  if (action === 'config') {
    return json(200, {
      clientId: process.env.PAYPAL_CLIENT_ID || '',
      sandbox: process.env.PAYPAL_SANDBOX === 'true',
    });
  }

  if (action === 'create') {
    const { readingId, locale } = body;
    if (!readingId) return json(400, { error: 'no_readingId' });
    const price = PRICES[locale];
    if (!price) return json(400, { error: 'bad_locale' });

    const token = await paypalToken();
    if (!token) return json(500, { error: 'config' });

    try {
      const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            custom_id: readingId,
            amount: { currency_code: price.currency_code, value: price.value },
          }],
        }),
      });
      const data = await res.json();
      if (!data.id) {
        console.error('paypal-order: create 실패', data);
        return json(502, { error: 'create_failed' });
      }
      return json(200, { orderID: data.id });
    } catch (e) {
      console.error('paypal-order: create 예외', e);
      return json(502, { error: 'create_error' });
    }
  }

  if (action === 'capture') {
    const { orderID } = body;
    if (!orderID) return json(400, { error: 'no_orderID' });

    const token = await paypalToken();
    if (!token) return json(500, { error: 'config' });

    try {
      const res = await fetch(
        `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }
      );
      const data = await res.json();

      if (data.status !== 'COMPLETED') {
        console.error('paypal-order: not_completed — capture 응답:', JSON.stringify(data));
        return json(402, { error: 'not_completed', status: data.status || null });
      }

      const pu = (data.purchase_units && data.purchase_units[0]) || {};
      const cap = pu.payments && pu.payments.captures && pu.payments.captures[0];
      const amount = cap && cap.amount;
      // capture 응답에서 custom_id는 PU가 아닌 captures[0]에 실려 오는 경우가 있어 양쪽을 본다.
      let readingId = (cap && cap.custom_id) || pu.custom_id;
      if (!readingId) {
        // 최후 수단: 주문 자체를 조회해 custom_id를 복구
        try {
          const or = await fetch(
            `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderID)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const od = await or.json();
          const opu = (od.purchase_units && od.purchase_units[0]) || {};
          readingId = opu.custom_id ||
            (opu.payments && opu.payments.captures && opu.payments.captures[0] && opu.payments.captures[0].custom_id);
        } catch (e) {
          console.error('paypal-order: 주문 재조회 실패', e);
        }
      }
      if (!readingId || !amount) {
        console.error('paypal-order: bad_order — capture 응답:', JSON.stringify(data));
        return json(400, { error: 'bad_order' });
      }

      // 금액 위조 차단: 캡처된 통화/금액이 서버 고정가 표와 정확히 일치할 때만 확정.
      // (공개 client-id로 임의 소액 주문을 만들어 capture만 호출하는 우회를 막는다)
      const locale = Object.keys(PRICES).find(
        (l) => PRICES[l].currency_code === amount.currency_code
      );
      const price = locale && PRICES[locale];
      if (!price || Number(amount.value) !== Number(price.value)) {
        console.warn('paypal-order: 금액 불일치 capture 거부', amount);
        return json(402, { error: 'amount_mismatch' });
      }

      await confirmAndTrigger(readingId, orderID, cap.id, locale, event);
      return json(200, { ok: true, readingId });
    } catch (e) {
      console.error('paypal-order: capture 예외', e);
      return json(502, { error: 'capture_error' });
    }
  }

  return json(400, { error: 'unknown_action' });
};
