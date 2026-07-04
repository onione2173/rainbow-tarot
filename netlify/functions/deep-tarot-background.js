// NicePay 결제조회로 실제 결제 여부/금액을 서버에서 검증 (멱등: 재조회 가능)
async function verifyPayment(tid) {
  if (!tid) return { ok: false, reason: 'no_tid' };
  const clientId = process.env.NICEPAY_CLIENT_KEY;
  const secretKey = process.env.NICEPAY_SECRET_KEY;
  if (!clientId || !secretKey) return { ok: false, reason: 'config' };

  const isSandbox = process.env.NICEPAY_SANDBOX === 'true';
  const apiBase = isSandbox
    ? 'https://sandbox-api.nicepay.co.kr'
    : 'https://api.nicepay.co.kr';
  const auth = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
  const EXPECTED_AMOUNT = Number(process.env.DEEP_READING_PRICE) || 1500;

  try {
    const res = await fetch(`${apiBase}/v1/payments/${encodeURIComponent(tid)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
    });
    const data = await res.json();
    const codeOk = String(data.resultCode) === '0000';
    const statusOk = String(data.status || '').toLowerCase() === 'paid';
    const amountOk = Number(data.amount) === EXPECTED_AMOUNT;
    if (codeOk && statusOk && amountOk) return { ok: true };
    return { ok: false, reason: 'unverified' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!apiKey || !supabaseUrl || !supabaseKey) return;

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return; }

  const { readingId, system, messages, tid } = payload;
  if (!readingId) return;

  const updateReading = async (fields) => {
    await fetch(`${supabaseUrl}/rest/v1/reading_history?id=eq.${readingId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(fields),
    });
  };

  // 유료 리포트 생성 전 결제 검증: 결제가 확인되지 않으면 생성하지 않음
  const verification = await verifyPayment(tid);
  if (!verification.ok) {
    await updateReading({ status: '오류', expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system,
        messages,
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    if (!text) {
      await updateReading({ status: '오류', expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
      return;
    }

    await updateReading({ full_reading: text, status: 'completed', expires_at: null });
  } catch {
    await updateReading({ status: '오류', expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  }
};
