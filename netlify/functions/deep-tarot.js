export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { message: '서버 설정 오류입니다.' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: { message: '잘못된 요청입니다.' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isPaid = payload.paid === true;
  payload.model = 'claude-sonnet-4-6';
  payload.max_tokens = isPaid ? 2500 : 600;
  payload.stream = isPaid;
  delete payload.paid;
  delete payload.paymentKey;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const errData = await upstream.text();
    return new Response(errData, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 무료 리딩은 기존 방식 (JSON)
  if (!isPaid) {
    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 유료 리딩: Anthropic SSE → plain text 스트림으로 변환
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              await writer.write(encoder.encode(evt.delta.text));
            }
          } catch {}
        }
      }
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
