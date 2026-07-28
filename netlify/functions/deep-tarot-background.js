// 심층 유료 리포트를 서버에서 완결 생성한다.
// 클라이언트는 { readingId, tid }만 보내고(프롬프트 전송 없음),
// 이 함수가 Supabase의 full_reading 스냅샷을 읽어 프롬프트를 재구성한다.
// nicepay-confirm(결제 승인) 또는 클라이언트(결제 복귀) 어느 쪽이 트리거해도
// 원자적 상태 클레임으로 단 한 번만 생성된다.

// ── locale별 배열법 fullName (ko/ja/en deep-reading 페이지의 SPREADS.fullName 이식) ──
const SPREADS_BY_LOCALE = {
  ko: {
    mind:     '아이가 무슨 생각 하는지 궁금해요 — 크로스 스프레드',
    behavior: '갑자기 행동이 이상해졌어요 — 호스슈 스프레드',
    change:   '이사·합사 등 변화를 앞두고 있어요 — 쓰리카드 스프레드',
  },
  ja: {
    mind:     'この子が何を考えているのか気になる — クロススプレッド',
    behavior: '急に様子がおかしくなった — ホースシュースプレッド',
    change:   '引っ越し・多頭飼いなど変化を控えている — スリーカードスプレッド',
  },
  en: {
    mind:     'I want to know what my pet is thinking — Cross Spread',
    behavior: "My pet's behavior suddenly changed — Horseshoe Spread",
    change:   'Getting ready for a big change — Three Card Spread',
  },
};

// ── 동물 종/나이 컨텍스트: locale별 (각 deep-reading 페이지의 buildSpeciesContext 이식) ──
function speciesContextKo(petInfo) {
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

function speciesContextJa(petInfo) {
  const sp = petInfo.species;
  const displaySpecies = sp === 'その他' ? (petInfo.otherSpecies || 'ペット') : sp;
  const ageText = petInfo.age || '';
  const ageNum = parseFloat(ageText.replace(/[^0-9.]/g, ''));
  const isMonths = ageText.includes('か月') || ageText.includes('ヶ月') || ageText.includes('month');
  let notes = [];

  if (sp === '犬') {
    if (!isMonths && ageNum >= 10) notes.push('シニア犬 — 関節の不調、認知機能の低下、分離不安など加齢に伴う問題を考慮');
    else if (!isMonths && ageNum <= 1 || isMonths && ageNum <= 12) notes.push('子犬期 — 社会化の途中、エネルギー過多、警戒心を学ぶ段階');
    notes.push('群れで生きる動物なので飼い主さんの感情にとても敏感で、絆が心理の核になる');
  } else if (sp === '猫') {
    if (!isMonths && ageNum >= 12) notes.push('シニア猫 — 腎機能の低下、甲状腺の問題、活動量の減少などを考慮');
    else if (!isMonths && ageNum <= 1 || isMonths && ageNum <= 12) notes.push('子猫 — 探求欲が強く、縄張りを確立している最中');
    notes.push('独立心が強くストレスを隠しがちで、環境の変化に敏感');
  } else if (sp === 'うさぎ') {
    notes.push('とても繊細でストレスが健康に直接影響する。社会的だけど一人の時間も必要');
  } else if (sp === '鳥') {
    notes.push('知能が高く、寂しさに弱い。同じ行動の繰り返しや羽をむしる行動はストレスのサイン');
  } else if (sp === 'その他') {
    notes.push(`${displaySpecies}という動物の特性を考慮してリーディング`);
  }

  return `[動物情報] 種類: ${displaySpecies}${ageText ? '、年齢: ' + ageText : ''}${petInfo.gender ? '、' + petInfo.gender : ''}。${notes.join('。')}`;
}

function speciesContextEn(petInfo) {
  const sp = petInfo.species;
  const displaySpecies = sp === 'Other' ? (petInfo.otherSpecies || 'pet') : sp;
  const ageText = petInfo.age || '';
  const ageNum = parseFloat(ageText.replace(/[^0-9.]/g, ''));
  const isMonths = /month/i.test(ageText);
  let notes = [];

  if (sp === 'Dog') {
    if (!isMonths && ageNum >= 10) notes.push('Senior dog — consider joint discomfort, cognitive decline, separation anxiety, and other age-related issues');
    else if ((!isMonths && ageNum <= 1) || (isMonths && ageNum <= 12)) notes.push('Puppy stage — still socializing, high energy, learning caution');
    notes.push("As a pack animal, very attuned to the owner's emotions; the bond is central to their psychology");
  } else if (sp === 'Cat') {
    if (!isMonths && ageNum >= 12) notes.push('Senior cat — consider declining kidney function, thyroid issues, reduced activity');
    else if ((!isMonths && ageNum <= 1) || (isMonths && ageNum <= 12)) notes.push('Kitten — highly curious, still establishing territory');
    notes.push('Independent-minded, tends to hide stress, sensitive to environmental change');
  } else if (sp === 'Rabbit') {
    notes.push('Very delicate; stress directly affects health. Social, but also needs alone time');
  } else if (sp === 'Bird') {
    notes.push('Highly intelligent, vulnerable to loneliness. Repetitive behavior or feather-plucking can be signs of stress');
  } else if (sp === 'Other') {
    notes.push(`Consider the traits of ${displaySpecies} in the reading`);
  }

  return `[Animal info] Species: ${displaySpecies}${ageText ? ', Age: ' + ageText : ''}${petInfo.gender ? ', ' + petInfo.gender : ''}. ${notes.join('. ')}`;
}

// ── 스냅샷 → 프롬프트: locale 분기 (각 deep-reading 페이지의 유료 리포트 프롬프트 그대로 이식) ──
function commonParts(snap, locale) {
  const petInfo = snap.petInfo || {};
  const drawnCards = snap.drawnCards || [];
  const actionCards = snap.actionCards || [];
  const fullName = (SPREADS_BY_LOCALE[locale] && SPREADS_BY_LOCALE[locale][snap.spreadKey]) || '';
  return { petInfo, drawnCards, actionCards, fullName, freeReadingText: snap.freeText || '' };
}

function buildPromptKo(snap) {
  const { petInfo, drawnCards, actionCards, fullName, freeReadingText } = commonParts(snap, 'ko');
  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? '역방향' : '정방향'})`).join('\n');
  const actionSummary = actionCards.length > 0
    ? actionCards.map(c => `${c.name}(${c.reversed ? '역방향' : '정방향'})`).join(', ')
    : null;
  const speciesCtx = speciesContextKo(petInfo);
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

function buildPromptJa(snap) {
  const { petInfo, drawnCards, actionCards, fullName, freeReadingText } = commonParts(snap, 'ja');
  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? '逆位置' : '正位置'})`).join('\n');
  const actionSummary = actionCards.length > 0
    ? actionCards.map(c => `${c.name}(${c.reversed ? '逆位置' : '正位置'})`).join(', ')
    : null;
  const speciesCtx = speciesContextJa(petInfo);
  const systemPrompt = `あなたはペットタロットの専門家です。温かく情感豊かな日本語で書いてください。必ずこの子の名前、種類、お悩みに直接言及してください。一般的な表現は使わないでください。`;
  const freeCtx = freeReadingText
    ? `\n無料プレビューで提供した最初のカードの解釈（これを参考に、さらに深く広げてください）:\n${freeReadingText}\n`
    : '';
  const userPrompt = `ペット: ${petInfo.name}（${petInfo.species}${petInfo.age ? '、' + petInfo.age : ''}${petInfo.gender ? '、' + petInfo.gender : ''}）
飼い主さんの呼び方: 「${petInfo.ownerTitle}」
${speciesCtx}
お悩み: ${petInfo.concern}
スプレッド: ${fullName}
引いたカード:
${cardSummary}
${actionSummary ? `\nアクションガイドカード: ${actionSummary}` : ''}
${freeCtx}
以下の4つのセクションで、十分に読み応えのあるレポートを作成してください:

## 🃏 カードごとのポジション解釈
各カードをポジションの意味と組み合わせて深く解釈してください。${petInfo.name}の状況に直接つなげてください。カード同士の流れやつながりにも触れてください。（各カード3〜4行）

## 💌 ${petInfo.name}の本音
${petInfo.name}の一人称視点での心の中の独白。飼い主さんを「${petInfo.ownerTitle}」と呼びながら直接語りかける形式。感情や願いを具体的に表現してください。（6〜8行）

## 🐾 飼い主さんへ
カード全体の流れをもとに、見落としているかもしれない視点、慰めと共感を伝えてください。具体的な気づきを含めてください。（4〜5行）

## ✨ これからのアクションガイド
${actionSummary
  ? `アクションガイドカード（${actionSummary}）を解釈して実践方法を提示してください。各項目: **【カード名】** — 具体的な行動とその理由。1〜${actionCards.length}個。`
  : `カードをもとに実践できる具体的なアクションガイドを3つ挙げてください。各項目: **行動** — 理由と方法。`}`;

  return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
}

function buildPromptEn(snap) {
  const { petInfo, drawnCards, actionCards, fullName, freeReadingText } = commonParts(snap, 'en');
  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? 'Reversed' : 'Upright'})`).join('\n');
  const actionSummary = actionCards.length > 0
    ? actionCards.map(c => `${c.name}(${c.reversed ? 'Reversed' : 'Upright'})`).join(', ')
    : null;
  const speciesCtx = speciesContextEn(petInfo);
  const systemPrompt = `You are a pet tarot expert. Write in warm, emotionally rich English. Always directly reference this pet's name, species, and concern. Never use generic phrasing.`;
  const freeCtx = freeReadingText
    ? `\nHere is the first card's interpretation from the free preview (use it as context and go deeper):\n${freeReadingText}\n`
    : '';
  const userPrompt = `Pet: ${petInfo.name} (${petInfo.species}${petInfo.age ? ', ' + petInfo.age : ''}${petInfo.gender ? ', ' + petInfo.gender : ''})
What the pet calls their person: "${petInfo.ownerTitle}"
${speciesCtx}
Concern: ${petInfo.concern}
Spread: ${fullName}
Cards drawn:
${cardSummary}
${actionSummary ? `\nAction Guide Cards: ${actionSummary}` : ''}
${freeCtx}
Write a substantial, satisfying report in the following four sections:

## 🃏 Card-by-Card Position Interpretation
Interpret each card in combination with its position's meaning. Connect it directly to ${petInfo.name}'s situation. Also touch on the flow and connections between the cards. (3-4 lines per card)

## 💌 A Letter from ${petInfo.name}'s Heart
A first-person inner monologue from ${petInfo.name}, speaking directly and calling their person "${petInfo.ownerTitle}." Express feelings and wishes concretely. (6-8 lines)

## 🐾 A Message for You
Based on the overall flow of the cards, offer a perspective the pet parent may be missing, along with comfort and empathy. Include a specific insight. (4-5 lines)

## ✨ Action Guide for What's Ahead
${actionSummary
  ? `Interpret the Action Guide Cards (${actionSummary}) and offer practical steps. Each item: **[Card Name]** — a concrete action and the reason for it. 1 to ${actionCards.length} items.`
  : `List three concrete, actionable steps based on the cards. Each item: **Action** — the reason and how to do it.`}`;

  return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
}

// snap.locale('ko' 기본/'ja'/'en')에 따라 프롬프트 생성
function buildPrompt(snap) {
  const locale = snap.locale === 'ja' ? 'ja' : snap.locale === 'en' ? 'en' : 'ko';
  if (locale === 'ja') return buildPromptJa(snap);
  if (locale === 'en') return buildPromptEn(snap);
  return buildPromptKo(snap);
}

// ── 결제 검증: 프로바이더 분기 ──
// PayPal 서버 고정가 (paypal-order.js PRICES와 동일 — 위조 결제 차단)
const PAYPAL_PRICES = {
  en: { currency_code: 'USD', value: '2.99' },
  ja: { currency_code: 'JPY', value: '300' },
};

function paypalBase() {
  return process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

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

// PayPal Orders API GET으로 결제 재검증(멱등): COMPLETED + custom_id===readingId + 금액/통화 일치
async function verifyPaymentPaypal(snap, readingId) {
  const orderID = snap.orderID;
  if (!orderID) return { ok: false, reason: 'no_order' };
  const price = PAYPAL_PRICES[snap.locale];
  if (!price) return { ok: false, reason: 'bad_locale' };
  const token = await paypalToken();
  if (!token) return { ok: false, reason: 'config' };
  try {
    const res = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderID)}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (data.status !== 'COMPLETED') return { ok: false, reason: 'not_completed' };
    const pu = (data.purchase_units && data.purchase_units[0]) || {};
    if (pu.custom_id !== readingId) return { ok: false, reason: 'custom_id' };
    const amt = pu.amount || {};
    if (amt.currency_code !== price.currency_code || Number(amt.value) !== Number(price.value)) {
      return { ok: false, reason: 'amount' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
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

  // 유료 리포트 생성 전 결제 검증: 프로바이더 분기
  //  - paypal: 스냅샷 orderID로 PayPal Orders GET 재검증
  //  - nicepay(기본): tid 우선순위 = 요청 tid > 스냅샷 tid
  let verification;
  if (snap.payProvider === 'paypal') {
    verification = await verifyPaymentPaypal(snap, readingId);
  } else {
    const effectiveTid = tid || snap.tid || null;
    verification = await verifyPayment(effectiveTid);
  }
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
