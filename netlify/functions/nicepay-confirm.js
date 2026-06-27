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
      body: JSON.stringify({ amount: Number(amount) }),
    });
    const data = await res.json();

    if (data.resultCode === '0000') {
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
