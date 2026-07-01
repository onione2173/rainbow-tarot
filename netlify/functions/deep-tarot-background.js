exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!apiKey || !supabaseUrl || !supabaseKey) return;

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return; }

  const { readingId, system, messages } = payload;
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
