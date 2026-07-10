// 심층 유료 리포트를 서버에서 완결 생성한다.
// 클라이언트는 { readingId, tid }만 보내고(프롬프트 전송 없음),
// 이 함수가 Supabase의 full_reading 스냅샷을 읽어 프롬프트를 재구성한다.
// nicepay-confirm(결제 승인) 또는 클라이언트(결제 복귀) 어느 쪽이 트리거해도
// 원자적 상태 클레임으로 단 한 번만 생성된다.

// ── 배열법 메타 (deep-reading/index.html의 SPREADS에서 fullName만 이식) ──
const SPREADS = {
  mind:     { fullName: '아이가 무슨 생각 하는지 궁금해요 — 크로스 스프레드' },
  behavior: { fullName: '갑자기 행동이 이상해졌어요 — 호스슈 스프레드' },
  change:   { fullName: '이사·합사 등 변화를 앞두고 있어요 — 쓰리카드 스프레드' },
};

// ── 동물 종/나이 컨텍스트 (deep-reading/index.html의 buildSpeciesContext 이식) ──
function buildSpeciesContext(petInfo) {
  const sp = petInfo.species;
  const displaySpecies = sp === '기타' ? (petInfo.otherSpecies || '반려동물') : sp;
  const ageText = petInfo.age || '';
  const ageNum = parseFloat(ageText.replace(/[^0-9.]/g, ''));
  const isMonths = ageText.includes('개월') || ageText.includes('month');
  let notes = [];

  if (sp === '강아지') {
    if (!isMonths && ageNum >= 10) notes.push('노령견 — 관절 이상, 인지 저하, 분리 불안 등 노화 관련 문제 고려');
    else if (!isMonths && ageNum <= 1 || isMonths && ageNum <= 12) notes.push('강아지 시기 — 사회화 과정 중, 에너지 과잉, 경계 학습 단계');
    notes.push('무리 동물로 보호자 감정에 매우 민감하고 유대가 심리의 핵심');
  } else if (sp === '고양이') {
    if (!isMonths && ageNum >= 12) notes.push('노령묘 — 신장 기능 저하, 갑상선 문제, 활동 감소 등 고려');
    else if (!isMonths && ageNum <= 1 || isMonths && ageNum <= 12) notes.push('어린 고양이 — 탐색 욕구 강함, 영역 확립 중');
    notes.push('독립적이며 스트레스를 숨기는 경향이 강하고 환경 변화에 예민');
  } else if (sp === '토끼') {
    notes.push('매우 예민하여 스트레스가 건강에 직접 영향을 줌. 사회적이지만 혼자만의 공간도 필요');
  } else if (sp === '새') {
    notes.push('지능이 높고 외로움에 취약. 반복 행동이나 털 뽑기는 스트레스 신호');
  } else if (sp === '기타') {
    notes.push(`${displaySpecies} 종 특성을 고려하여 리딩`);
  }

  return `[동물 정보] 종: ${displaySpecies}${ageText ? ', 나이: ' + ageText : ''}${petInfo.gender ? ', ' + petInfo.gender : ''}. ${notes.join('. ')}`;
}

// ── 스냅샷 → 프롬프트 (deep-reading/index.html startBackgroundReport의 문구 그대로 이식) ──
function buildPrompt(snap) {
  const petInfo = snap.petInfo || {};
  const drawnCards = snap.drawnCards || [];
  const actionCards = snap.actionCards || [];
  const freeReadingText = snap.freeText || '';
  const fullName = (SPREADS[snap.spreadKey] && SPREADS[snap.spreadKey].fullName) || '';

  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? '역방향' : '정방향'})`).join('\n');
  const actionSummary = actionCards.length > 0
    ? actionCards.map(c => `${c.name}(${c.reversed ? '역방향' : '정방향'})`).join(', ')
    : null;
  const speciesCtx = buildSpeciesContext(petInfo);
  const systemPrompt = `당신은 반려동물 타로 전문가입니다. 따뜻하고 감성적인 한국어로 작성하세요. 반드시 이 아이의 이름, 종, 고민을 직접 언급하세요. 일반적인 표현은 쓰지 마세요.`;
  const freeCtx = freeReadingText
    ? `\n무료 미리보기에서 제공된 첫 카드 해석 (이를 참고하여 더 깊이 확장하세요):\n${freeReadingText}\n`
    : '';
  const userPrompt = `반려동물: ${petInfo.name} (${petInfo.species}${petInfo.age ? ', ' + petInfo.age : ''}${petInfo.gender ? ', ' + petInfo.gender : ''})
보호자 호칭: "${petInfo.ownerTitle}"
${speciesCtx}
고민: ${petInfo.concern}
배열법: ${fullName}
뽑힌 카드:
${cardSummary}
${actionSummary ? `\n행동 가이드 카드: ${actionSummary}` : ''}
${freeCtx}
아래 네 섹션으로 충분히 풍부하게 리포트를 작성하세요:

## 🃏 카드별 포지션 해석
각 카드를 포지션 의미와 결합하여 깊이 있게 해석. ${petInfo.name}의 상황에 직접 연결. 카드 간 흐름과 연결도 언급. (각 카드 3~4줄)

## 💌 ${petInfo.name}의 속마음
${petInfo.name}의 1인칭 시점 내면 독백. 보호자를 "${petInfo.ownerTitle}"(이)라고 부르며 직접 말하는 형식. 감정과 바람을 구체적으로 표현. (6~8줄)

## 🐾 보호자님께
카드 전체 흐름을 바탕으로 놓치고 있을 수 있는 관점, 위로와 공감. 구체적인 인사이트 포함. (4~5줄)

## ✨ 앞으로의 행동 가이드
${actionSummary
  ? `행동 가이드 카드(${actionSummary})를 해석하여 실천 방법 제시. 각 항목: **[카드 이름]** — 구체적인 행동과 이유. 1~${actionCards.length}가지.`
  : `카드를 바탕으로 실천할 수 있는 구체적인 행동 가이드 3가지. 각 항목: **행동** — 이유와 방법.`}`;

  return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
}

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
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    console.warn('deep-tarot-background: missing env (ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    return;
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return; }

  const { readingId, tid } = payload;
  if (!readingId) return;

  const sbHeaders = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  };
  const errExpires = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const updateReading = async (fields) => {
    await fetch(`${supabaseUrl}/rest/v1/reading_history?id=eq.${readingId}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields),
    });
  };

  // ── 원자적 클레임 ──
  // 상태가 '결제 완료'/'결제 대기'/'오류' 중 하나일 때만 '생성 중'으로 전환.
  // 이미 '생성 중' 또는 'completed'면 0행 → 다른 트리거가 처리 중이므로 스킵.
  // (nicepay-confirm 트리거와 클라이언트 트리거의 중복 실행 방지)
  let claimed;
  try {
    const inList = encodeURIComponent('"결제 완료","결제 대기","오류"');
    const res = await fetch(
      `${supabaseUrl}/rest/v1/reading_history?id=eq.${readingId}&status=in.(${inList})`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({ status: '생성 중' }),
      }
    );
    claimed = await res.json();
  } catch (e) {
    console.error('deep-tarot-background: claim failed', e);
    return;
  }
  if (!Array.isArray(claimed) || claimed.length === 0) {
    // 이미 생성 중이거나 완료됨 → 중복 트리거이므로 스킵
    return;
  }

  const row = claimed[0];
  let snap;
  try { snap = JSON.parse(row.full_reading); } catch {
    console.error('deep-tarot-background: snapshot parse failed for', readingId);
    await updateReading({ status: '오류', expires_at: errExpires() });
    return;
  }

  // 유료 리포트 생성 전 결제 검증: tid 우선순위 = 요청 tid > 스냅샷 tid
  const effectiveTid = tid || snap.tid || null;
  const verification = await verifyPayment(effectiveTid);
  if (!verification.ok) {
    await updateReading({ status: '오류', expires_at: errExpires() });
    return;
  }

  // 결제 검증 통과 → 프롬프트 재구성 후 리포트 생성
  const { system, messages } = buildPrompt(snap);

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
      await updateReading({ status: '오류', expires_at: errExpires() });
      return;
    }

    await updateReading({ full_reading: text, status: 'completed', expires_at: null });
  } catch {
    await updateReading({ status: '오류', expires_at: errExpires() });
  }
};
