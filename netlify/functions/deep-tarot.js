exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: '서버 설정 오류입니다.' } }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: '잘못된 요청입니다.' } }),
    };
  }

  const isPaid = payload.paid === true;
  payload.model = 'claude-sonnet-4-6';
  payload.max_tokens = isPaid ? 4500 : 900;
  delete payload.paid;
  delete payload.paymentKey;

  // TODO: 나이스페이 결제 검증 추가 예정
  // isPaid === true 일 때 payload.paymentKey 로 나이스페이 서버 검증 후 리포트 발급

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  return {
    statusCode: response.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
