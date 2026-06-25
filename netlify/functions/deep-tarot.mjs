export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: '서버 설정 오류입니다.' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { message: '잘못된 요청입니다.' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const isPaid = payload.paid === true;
  const shouldStream = payload.stream === true;

  payload.model = 'claude-sonnet-4-6';
  payload.max_tokens = isPaid ? 1500 : 700;
  payload.stream = shouldStream;
  delete payload.paid;
  delete payload.paymentKey;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    if (shouldStream) {
      if (!upstream.ok) {
        const err = await upstream.json().catch(() => ({}));
        return new Response(
          JSON.stringify({ error: err.error || { message: `API 오류 (${upstream.status})` } }),
          { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { message: e.message || '서버 오류' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
