// 마이페이지에서 완료된 유료 리딩에 후기(별점+코멘트)를 남길 때 호출.
// 클라이언트가 보낸 access_token으로 실제 로그인 유저인지 검증하고,
// 해당 리딩(reading_history)이 그 유저 소유이고 완료 상태인지도 서버에서 재확인한 뒤에만
// reviews 테이블에 기록한다(별점/코멘트를 클라이언트 값 그대로 믿지 않고 형태만 검증).
// 같은 리딩에 다시 제출하면 upsert로 덮어써서 "후기 수정"이 되게 한다.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.warn('submit-review: missing env (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)');
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: '' }; }

  const token = payload.access_token;
  const readingId = payload.reading_history_id;
  const rating = Number(payload.rating);
  const comment = String(payload.comment || '').trim().slice(0, 500);
  if (!token || !readingId) return { statusCode: 400, body: '' };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { statusCode: 400, body: '' };

  // 1. 로그인 유저 검증
  let user;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { statusCode: 401, body: '' };
    user = await res.json();
  } catch {
    return { statusCode: 401, body: '' };
  }
  if (!user?.id) return { statusCode: 401, body: '' };

  const svcHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // 2. 그 리딩이 이 유저 소유이고 완료된 건인지 재확인 (클라이언트 신고를 그대로 믿지 않음)
  let reading;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/reading_history?id=eq.${encodeURIComponent(readingId)}&select=id,user_id,status,spread_type,pet_name`,
      { headers: svcHeaders }
    );
    const rows = await res.json();
    reading = Array.isArray(rows) ? rows[0] : null;
  } catch {
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }
  if (!reading || reading.user_id !== user.id || reading.status !== 'completed') {
    return { statusCode: 403, body: JSON.stringify({ ok: false, reason: 'not_owner' }) };
  }

  const displayName = maskName(user);

  // 3. reviews 테이블에 upsert (같은 reading_history_id면 덮어써서 "수정"이 되게)
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/reviews?on_conflict=reading_history_id`,
      {
        method: 'POST',
        headers: { ...svcHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          reading_history_id: readingId,
          user_id: user.id,
          spread_type: reading.spread_type || null,
          pet_name: reading.pet_name || null,
          display_name: displayName,
          rating,
          comment: comment || null,
          approved: false,
        }),
      }
    );
    if (!res.ok) {
      console.warn('submit-review: reviews insert failed', await res.text());
      return { statusCode: 200, body: JSON.stringify({ ok: false }) };
    }
  } catch (e) {
    console.warn('submit-review: reviews insert error', e);
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }

  // 4. reading_history.reviewed = true 표시 (마이페이지에서 "수정하기"로 보이게)
  try {
    await fetch(`${supabaseUrl}/rest/v1/reading_history?id=eq.${encodeURIComponent(readingId)}`, {
      method: 'PATCH',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ reviewed: true }),
    });
  } catch {}

  // 5. Slack 알림 (실패해도 후기 저장 자체는 이미 끝났으니 무시)
  if (webhookUrl) {
    try {
      const stars = '⭐️'.repeat(rating) + '☆'.repeat(5 - rating);
      const spreadLabel = reading.spread_type ? ` · ${reading.spread_type}` : '';
      const petLabel = reading.pet_name ? ` (${reading.pet_name})` : '';
      let text = `📝 새 후기 ${stars}${spreadLabel}${petLabel} — ${displayName}`;
      if (comment) text += `\n"${comment}"`;
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {}
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

// 사용자 이름에서 성만 남기고 나머지는 'ㅇ'으로 마스킹 ("김민준" -> "김ㅇㅇ").
// 한글이 아니면(구글 로그인 영문 이름 등) 첫 글자 + 별표로 대체.
function maskName(user) {
  const raw = (user.user_metadata?.full_name || user.user_metadata?.name || '').trim();
  if (!raw) return '익명';
  const first = raw[0];
  if (/[가-힣]/.test(first)) {
    return first + 'ㅇ'.repeat(Math.max(1, raw.length - 1));
  }
  return first + '*'.repeat(Math.max(1, raw.length - 1));
}
