// 신규 회원가입 시 Slack으로 알림. 클라이언트가 보낸 access_token으로 실제
// 로그인된 유저인지 서버에서 검증한 뒤(이름/이메일 등은 클라이언트 입력을 믿지 않고
// Supabase에서 직접 조회), Slack 웹훅으로 한 줄 메시지만 보낸다.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!supabaseUrl || !anonKey || !webhookUrl) return { statusCode: 200, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: '' }; }
  const token = payload.access_token;
  if (!token) return { statusCode: 400, body: '' };

  let user;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { statusCode: 200, body: '' };
    user = await res.json();
  } catch {
    return { statusCode: 200, body: '' };
  }
  if (!user?.id || user.is_anonymous) return { statusCode: 200, body: '' };

  const provider = user.app_metadata?.provider || 'unknown';
  const label = user.user_metadata?.full_name || user.user_metadata?.name || user.email || user.id;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🎉 신규 회원가입: ${label} (${provider})` }),
    });
  } catch {}

  return { statusCode: 200, body: '' };
};
