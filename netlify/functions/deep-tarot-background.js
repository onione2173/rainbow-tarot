// 심층 유료 리포트를 서버에서 완결 생성한다.
// 클라이언트는 { readingId, tid }만 보내고(프롬프트 전송 없음),
// 이 함수가 Supabase의 full_reading 스냅샷을 읽어 프롬프트를 재구성한다.
// nicepay-confirm(결제 승인) 또는 클라이언트(결제 복귀) 어느 쪽이 트리거해도
// 원자적 상태 클레임으로 단 한 번만 생성된다.

// ── locale별 배열법 fullName (ko/ja/en deep-reading 페이지의 SPREADS.fullName 이식) ──
const SPREADS_BY_LOCALE = {
  ko: {
    mind:      '아이가 무슨 생각 하는지 궁금해요 — 크로스 스프레드',
    behavior:  '갑자기 행동이 이상해졌어요 — 호스슈 스프레드',
    change:    '이사·합사 등 변화를 앞두고 있어요 — 쓰리카드 스프레드',
    pastlife:  '전생 이야기를 더 깊이 알고 싶어요 — 전생 연대기 스프레드',
    chemistry: '우리 케미를 더 깊이 알고 싶어요 — 케미 스프레드',
  },
  ja: {
    mind:      'この子が何を考えているのか気になる — クロススプレッド',
    behavior:  '急に様子がおかしくなった — ホースシュースプレッド',
    change:    '引っ越し・多頭飼いなど変化を控えている — スリーカードスプレッド',
    pastlife:  '前世の物語をもっと知りたい — 前世クロニクルスプレッド',
    chemistry: '私たちの相性をもっと知りたい — 相性スプレッド',
  },
  en: {
    mind:      'I want to know what my pet is thinking — Cross Spread',
    behavior:  "My pet's behavior suddenly changed — Horseshoe Spread",
    change:    'Getting ready for a big change — Three Card Spread',
    pastlife:  "I want to know more about my pet's past life — Past Life Chronicle Spread",
    chemistry: 'I want to know more about our chemistry — Chemistry Spread',
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

// ── 전생/케미 스토리형 스프레드: 고민상담형과 다른 프롬프트 구조(행동가이드 없음) ──
function buildStoryPromptKo(snap) {
  const { petInfo, drawnCards, fullName, freeReadingText } = commonParts(snap, 'ko');
  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? '역방향' : '정방향'})`).join('\n');
  const freeCtx = freeReadingText
    ? `\n무료 미리보기에서 이미 보여준 카드 1(${drawnCards[0]?.position}) 해석 — 아래 텍스트를 한 글자도 바꾸지 말고, 카드별 해석 섹션의 첫 항목으로 그대로 포함하세요:\n${freeReadingText}\n`
    : '';
  const concernLine = petInfo.concern ? `참고 정보: ${petInfo.concern}\n` : '';
  const petHeader = `반려동물: ${petInfo.name} (${petInfo.species}${petInfo.age ? ', ' + petInfo.age : ''}${petInfo.gender ? ', ' + petInfo.gender : ''})
보호자 호칭: "${petInfo.ownerTitle}"
${concernLine}배열법: ${fullName}
뽑힌 카드:
${cardSummary}
${freeCtx}`;
  const noMetaNote = `'미리보기에서 보신 것처럼' 같은 메타 언급은 절대 하지 마세요 — 이 리포트는 그 자체로 완결된 문서입니다.`;

  if (snap.spreadKey === 'pastlife') {
    const cardInstruction = freeReadingText
      ? `카드 1(${drawnCards[0]?.position})은 위에 제공된 무료 미리보기 텍스트를 한 글자도 바꾸지 말고 그대로 첫 항목으로 포함하세요. 나머지 카드는 포지션 순서(지금 성격을 만든 전생 → 이번 생에서 다시 만난 이유)에 따라 하나로 이어지는 연대기처럼 새로 해석하세요. 각 전생의 시대·장소·모습을 구체적으로 상상해서 묘사. ${petInfo.name}의 지금 성격과 자연스럽게 연결. (나머지 각 카드 3~4줄) ${noMetaNote}`
      : `세 카드를 포지션 순서(가장 오래된 전생 → 지금 성격을 만든 전생 → 이번 생에서 다시 만난 이유)에 따라 하나로 이어지는 연대기처럼 해석. 각 전생의 시대·장소·모습을 구체적으로 상상해서 묘사. ${petInfo.name}의 지금 성격과 자연스럽게 연결. (각 카드 3~4줄)`;
    const systemPrompt = `당신은 반려동물의 전생을 타로카드로 상상해서 들려주는 채널러입니다. 실제 예언이 아니라 유쾌하고 몰입감 있는 상상 놀이라는 톤을 유지하되, 진지하게 몰입해서 이야기해주세요. 반드시 이 아이의 이름과 종을 직접 언급하세요. 일반적인 표현은 쓰지 마세요. 메시지·마무리 섹션은 위 카드별 전생 해석에서 실제로 다룬 그 카드의 의미에서 감정과 표현이 이어져야 합니다. 카드 이름만 장식으로 끼워넣고 내용은 카드와 무관한 상투적 위로로 채우면 안 됩니다 — 카드가 달랐다면 이 문단의 핵심 문장도 달라져야 합니다.`;
    const userPrompt = `${petHeader}
아래 세 섹션으로 충분히 풍부하게 전생 이야기를 작성하세요:

## 🕰️ 카드별 전생 해석
${cardInstruction}

## 💌 전생이 전하는 메시지
그 전생들의 자아가 하나로 모여 ${petInfo.name}의 1인칭 시점으로 "${petInfo.ownerTitle}"에게 전하는 메시지. 감정과 애정을 구체적으로 표현. 위 카드별 전생 해석에서 나온 카드 의미를 실제로 이어받아 쓰기 — 카드 이름만 끼워넣고 내용은 바뀌지 않는 건 안 됨. (6~8줄)

## 🐾 지금 이 아이와 다시 만난 이유
카드 전체 흐름을 바탕으로 ${petInfo.name}와 "${petInfo.ownerTitle}"이(가) 이번 생에서 다시 만난 이유를 따뜻하게 풀어내기. 이 카드 조합이었기 때문에 할 수 있는 이야기를 쓰고, 카드가 달랐어도 똑같이 쓸 수 있는 상투적 위로 문구는 피하기. 위로와 감동 포함. (4~5줄)`;
    return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
  }

  // chemistry
  const cardInstruction = freeReadingText
    ? `카드 1(${drawnCards[0]?.position})은 위에 제공된 무료 미리보기 텍스트를 한 글자도 바꾸지 말고 그대로 첫 항목으로 포함하세요. 나머지 카드는 포지션 의미(아이가 느끼는 우리 사이 → 앞으로 더 좋아지는 방법)와 결합하여 깊이 있게 새로 해석하세요. 카드 간 흐름도 언급. (나머지 각 카드 3~4줄) ${noMetaNote}`
    : `세 카드를 포지션 의미(내가 느끼는 우리 사이 → 아이가 느끼는 우리 사이 → 앞으로 더 좋아지는 방법)와 결합하여 깊이 있게 해석. 카드 간 흐름도 언급. (각 카드 3~4줄)`;
  const systemPrompt = `당신은 보호자와 반려동물 사이의 케미(궁합)를 타로카드로 읽어주는 채널러입니다. 반드시 이 아이의 이름과 종을 직접 언급하세요. 일반적인 표현은 쓰지 마세요. 편지 섹션은 위 카드별 케미 해석에서 실제로 다룬 그 카드의 의미에서 감정과 표현이 이어져야 합니다. 카드 이름만 장식으로 끼워넣고 내용은 카드와 무관한 상투적 표현으로 채우면 안 됩니다.`;
  const userPrompt = `${petHeader}
아래 세 섹션으로 충분히 풍부하게 케미 리포트를 작성하세요:

## 💞 카드별 케미 해석
${cardInstruction}

## 💌 ${petInfo.name}이 전하는 마음
${petInfo.name}의 1인칭 시점 내면 독백. 보호자를 "${petInfo.ownerTitle}"(이)라고 부르며 직접 말하는 애정 어린 편지 형식. 위 카드별 케미 해석에서 나온 카드 의미를 실제로 이어받아 쓰기 — 카드 이름만 끼워넣고 내용은 바뀌지 않는 건 안 됨. (6~8줄)

## ✨ 케미 up 실천 팁
카드를 바탕으로 지금 바로 해볼 수 있는 구체적인 실천 팁 3가지. 각 항목: **팁 제목** — 이유와 방법.`;
  return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
}

function buildPromptKo(snap, pastLossDetected) {
  if (snap.spreadKey === 'pastlife' || snap.spreadKey === 'chemistry') return buildStoryPromptKo(snap);
  const { petInfo, drawnCards, actionCards, fullName, freeReadingText } = commonParts(snap, 'ko');
  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? '역방향' : '정방향'})`).join('\n');
  const actionSummary = actionCards.length > 0
    ? actionCards.map(c => `${c.name}(${c.reversed ? '역방향' : '정방향'})`).join(', ')
    : null;
  const speciesCtx = speciesContextKo(petInfo);
  const lossNote = pastLossDetected
    ? ` [내부 참고, 리딩에 그대로 인용하거나 "기록에 따르면" 식으로 출처를 밝히지 말 것] ${petInfo.name}은(는) 이미 무지개다리를 건넌 것으로 보입니다. 톤과 시제만 이에 맞게 자연스럽게 조율하세요.`
    : '';
  const systemPrompt = `당신은 반려동물 타로 전문가입니다. 따뜻하고 감성적인 한국어로 작성하세요. 반드시 이 아이의 이름, 종, 고민을 직접 언급하세요. 일반적인 표현은 쓰지 마세요. 속마음 편지·보호자님께 섹션은 위 🃏 카드별 해석에서 실제로 다룬 그 카드의 의미에서 감정과 표현이 이어져야 합니다. 카드 이름만 장식으로 끼워넣고 내용은 카드와 무관한 상투적 위로("곁에 있어요", "원망하지 않아요" 등)로 채우면 안 됩니다 — 카드가 달랐다면 이 문단의 핵심 문장도 달라져야 합니다.${lossNote}`;
  const freeCtx = freeReadingText
    ? `\n무료 미리보기에서 이미 보여준 카드 1(${drawnCards[0]?.position}) 해석 — 아래 텍스트를 한 글자도 바꾸지 말고, 카드별 해석 섹션의 첫 항목으로 그대로 포함하세요:\n${freeReadingText}\n`
    : '';
  const cardInstruction = freeReadingText
    ? `카드 1(${drawnCards[0]?.position})은 위에 제공된 무료 미리보기 텍스트를 한 글자도 바꾸지 말고 그대로 첫 항목으로 포함하세요. 나머지 카드는 포지션 의미와 결합하여 깊이 있게 새로 해석하세요. ${petInfo.name}의 상황에 직접 연결. 카드 간 흐름과 연결도 언급. (나머지 각 카드 3~4줄) '미리보기에서 보신 것처럼' 같은 메타 언급은 절대 하지 마세요 — 이 리포트는 그 자체로 완결된 문서입니다.`
    : `각 카드를 포지션 의미와 결합하여 깊이 있게 해석. ${petInfo.name}의 상황에 직접 연결. 카드 간 흐름과 연결도 언급. (각 카드 3~4줄)`;
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
${cardInstruction}

## 💌 ${petInfo.name}의 속마음
${petInfo.name}의 1인칭 시점 내면 독백. 보호자를 "${petInfo.ownerTitle}"(이)라고 부르며 직접 말하는 형식. 감정과 바람을 구체적으로 표현. 위 카드별 포지션 해석에서 나온 카드 의미를 실제로 이어받아 쓰기 — 카드 이름만 끼워넣고 내용은 바뀌지 않는 건 안 됨. (6~8줄)

## 🐾 보호자님께
카드 전체 흐름을 바탕으로 놓치고 있을 수 있는 관점, 위로와 공감. 이 카드 조합이었기 때문에 할 수 있는 이야기를 쓰고, 카드가 달랐어도 똑같이 쓸 수 있는 상투적 위로 문구는 피하기. 구체적인 인사이트 포함. (4~5줄)

## ✨ 앞으로의 행동 가이드
${actionSummary
  ? `행동 가이드 카드(${actionSummary})를 해석하여 실천 방법 제시. 각 항목: **[카드 이름]** — 구체적인 행동과 이유. 1~${actionCards.length}가지.`
  : `카드를 바탕으로 실천할 수 있는 구체적인 행동 가이드 3가지. 각 항목: **행동** — 이유와 방법.`}`;

  return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
}

function buildStoryPromptJa(snap) {
  const { petInfo, drawnCards, fullName, freeReadingText } = commonParts(snap, 'ja');
  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? '逆位置' : '正位置'})`).join('\n');
  const freeCtx = freeReadingText
    ? `\n無料プレビューですでに見せたカード1(${drawnCards[0]?.position})の解釈 — 下のテキストは一字も変えずに、カードごとの解釈セクションの最初の項目としてそのまま含めてください:\n${freeReadingText}\n`
    : '';
  const concernLine = petInfo.concern ? `参考情報: ${petInfo.concern}\n` : '';
  const petHeader = `ペット: ${petInfo.name}（${petInfo.species}${petInfo.age ? '、' + petInfo.age : ''}${petInfo.gender ? '、' + petInfo.gender : ''}）
飼い主さんの呼び方: 「${petInfo.ownerTitle}」
${concernLine}スプレッド: ${fullName}
引いたカード:
${cardSummary}
${freeCtx}`;
  const noMetaNote = `「無料プレビューでご覧いただいたように」のようなメタ的な言及は絶対にしないでください — このレポートはそれ自体で完結した文章です。`;

  if (snap.spreadKey === 'pastlife') {
    const cardInstruction = freeReadingText
      ? `カード1(${drawnCards[0]?.position})は上に提供した無料プレビューのテキストを一字も変えずにそのまま最初の項目として含めてください。残りのカードはポジション順(今の性格を作った前世 → 今また出会った理由)に沿って、ひとつながりの年代記として新しく解釈してください。各前世の時代・場所・姿を具体的に描写してください。${petInfo.name}の今の性格と自然につなげてください。(残りの各カード3〜4行) ${noMetaNote}`
      : `3枚のカードをポジション順(いちばん古い前世 → 今の性格を作った前世 → 今また出会った理由)に沿って、ひとつながりの年代記として解釈してください。各前世の時代・場所・姿を具体的に描写してください。${petInfo.name}の今の性格と自然につなげてください。(各カード3〜4行)`;
    const systemPrompt = `あなたはペットの前世をタロットカードで想像して伝えるチャネラーです。必ず日本語で、です・ます調で書いてください。実際の予言ではなく、没入感のある物語として、真剣な気持ちで語ってください。必ずこの子の名前と種類に直接言及してください。一般的な表現は使わないでください。メッセージ・締めくくりのセクションは、上のカードごとの前世解釈で実際に扱ったそのカードの意味から感情と表現がつながっている必要があります。カードの名前だけを飾りとして入れて、内容はカードと無関係な定型的な慰めの言葉で埋めるのはだめです — カードが違えば、この段落の核心となる文も違ってくるはずです。`;
    const userPrompt = `${petHeader}
以下の3つのセクションで、十分に読み応えのある前世の物語を作成してください:

## 🕰️ カードごとの前世解釈
${cardInstruction}

## 💌 前世からのメッセージ
その前世たちの魂がひとつになり、${petInfo.name}の一人称視点で「${petInfo.ownerTitle}」に伝えるメッセージ。感情と愛情を具体的に表現してください。上のカードごとの前世解釈で出てきたカードの意味を実際に引き継いで書いてください — カードの名前だけ入れて内容は変わらないのはだめです。(6〜8行)

## 🐾 今この子と再び出会った理由
カード全体の流れをもとに、${petInfo.name}と「${petInfo.ownerTitle}」が今生でまた出会った理由を温かく語ってください。このカードの組み合わせだからこそ言えることを書き、カードが違っても同じように書けるような定型的な慰めの言葉は避けてください。慰めと感動を含めてください。(4〜5行)`;
    return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
  }

  const cardInstruction = freeReadingText
    ? `カード1(${drawnCards[0]?.position})は上に提供した無料プレビューのテキストを一字も変えずにそのまま最初の項目として含めてください。残りのカードはポジションの意味(うちの子が感じているふたりの関係 → 相性がもっと良くなる方法)と組み合わせて深く新しく解釈してください。カード同士の流れにも触れてください。(残りの各カード3〜4行) ${noMetaNote}`
    : `3枚のカードをポジションの意味(私が感じているふたりの関係 → うちの子が感じているふたりの関係 → 相性がもっと良くなる方法)と組み合わせて深く解釈してください。カード同士の流れにも触れてください。(各カード3〜4行)`;
  const systemPrompt = `あなたは飼い主さんとペットの相性をタロットカードで読み解くチャネラーです。必ず日本語で、です・ます調で書いてください。必ずこの子の名前と種類に直接言及してください。一般的な表現は使わないでください。手紙のセクションは、上のカードごとの相性解釈で実際に扱ったそのカードの意味から感情と表現がつながっている必要があります。カードの名前だけを飾りとして入れて、内容はカードと無関係な定型的な表現で埋めるのはだめです。`;
  const userPrompt = `${petHeader}
以下の3つのセクションで、十分に読み応えのある相性レポートを作成してください:

## 💞 カードごとの相性解釈
${cardInstruction}

## 💌 ${petInfo.name}が伝える気持ち
${petInfo.name}の一人称視点での心の中の独白。飼い主さんを「${petInfo.ownerTitle}」と呼びながら直接語りかける、愛情のこもった手紙の形式。上のカードごとの相性解釈で出てきたカードの意味を実際に引き継いで書いてください — カードの名前だけ入れて内容は変わらないのはだめです。(6〜8行)

## ✨ 相性アップの実践ヒント
カードをもとに、今すぐ試せる具体的な実践ヒントを3つ挙げてください。各項目: **ヒントのタイトル** — 理由と方法。`;
  return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
}

function buildPromptJa(snap, pastLossDetected) {
  if (snap.spreadKey === 'pastlife' || snap.spreadKey === 'chemistry') return buildStoryPromptJa(snap);
  const { petInfo, drawnCards, actionCards, fullName, freeReadingText } = commonParts(snap, 'ja');
  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? '逆位置' : '正位置'})`).join('\n');
  const actionSummary = actionCards.length > 0
    ? actionCards.map(c => `${c.name}(${c.reversed ? '逆位置' : '正位置'})`).join(', ')
    : null;
  const speciesCtx = speciesContextJa(petInfo);
  const lossNote = pastLossDetected
    ? ` [内部参考、レポートにそのまま引用したり「記録によると」のように出典を明かさないこと] ${petInfo.name}はすでに虹の橋を渡ったと見られます。トーンと時制だけをそれに合わせて自然に調整してください。`
    : '';
  const systemPrompt = `あなたはペットタロットの専門家です。温かく情感豊かな日本語で書いてください。必ずこの子の名前、種類、お悩みに直接言及してください。一般的な表現は使わないでください。本音・飼い主さんへのセクションは、上の🃏カードごとの解釈で実際に扱ったそのカードの意味から感情と表現がつながっている必要があります。カードの名前だけを飾りとして入れて、内容を「そばにいます」「恨んでいません」のようなカードと無関係な定型的な慰めの言葉で埋めるのはだめです — カードが違えば、この段落の核心となる文も違ってくるはずです。${lossNote}`;
  const freeCtx = freeReadingText
    ? `\n無料プレビューですでに見せたカード1(${drawnCards[0]?.position})の解釈 — 下のテキストは一字も変えずに、カードごとの解釈セクションの最初の項目としてそのまま含めてください:\n${freeReadingText}\n`
    : '';
  const cardInstruction = freeReadingText
    ? `カード1(${drawnCards[0]?.position})は上に提供した無料プレビューのテキストを一字も変えずにそのまま最初の項目として含めてください。残りのカードはポジションの意味と組み合わせて深く新しく解釈してください。${petInfo.name}の状況に直接つなげてください。カード同士の流れやつながりにも触れてください。（残りの各カード3〜4行）「無料プレビューでご覧いただいたように」のようなメタ的な言及は絶対にしないでください — このレポートはそれ自体で完結した文章です。`
    : `各カードをポジションの意味と組み合わせて深く解釈してください。${petInfo.name}の状況に直接つなげてください。カード同士の流れやつながりにも触れてください。（各カード3〜4行）`;
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
${cardInstruction}

## 💌 ${petInfo.name}の本音
${petInfo.name}の一人称視点での心の中の独白。飼い主さんを「${petInfo.ownerTitle}」と呼びながら直接語りかける形式。感情や願いを具体的に表現してください。上のカードごとのポジション解釈で出てきたカードの意味を実際に引き継いで書いてください — カードの名前だけ入れて内容は変わらないのはだめです。（6〜8行）

## 🐾 飼い主さんへ
カード全体の流れをもとに、見落としているかもしれない視点、慰めと共感を伝えてください。このカードの組み合わせだからこそ言えることを書き、カードが違っても同じように書けるような定型的な慰めの言葉は避けてください。具体的な気づきを含めてください。（4〜5行）

## ✨ これからのアクションガイド
${actionSummary
  ? `アクションガイドカード（${actionSummary}）を解釈して実践方法を提示してください。各項目: **【カード名】** — 具体的な行動とその理由。1〜${actionCards.length}個。`
  : `カードをもとに実践できる具体的なアクションガイドを3つ挙げてください。各項目: **行動** — 理由と方法。`}`;

  return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
}

function buildStoryPromptEn(snap) {
  const { petInfo, drawnCards, fullName, freeReadingText } = commonParts(snap, 'en');
  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? 'Reversed' : 'Upright'})`).join('\n');
  const freeCtx = freeReadingText
    ? `\nCard 1 (${drawnCards[0]?.position}) was already shown in the free preview — reuse the text below word-for-word as the first item in the card-by-card section, do not rewrite or summarize it:\n${freeReadingText}\n`
    : '';
  const concernLine = petInfo.concern ? `Notes: ${petInfo.concern}\n` : '';
  const petHeader = `Pet: ${petInfo.name} (${petInfo.species}${petInfo.age ? ', ' + petInfo.age : ''}${petInfo.gender ? ', ' + petInfo.gender : ''})
What the pet calls their person: "${petInfo.ownerTitle}"
${concernLine}Spread: ${fullName}
Cards drawn:
${cardSummary}
${freeCtx}`;
  const noMetaNote = `Never write meta-references like "as you saw in the preview" — this report must read as a single, complete, self-contained document.`;

  if (snap.spreadKey === 'pastlife') {
    const cardInstruction = freeReadingText
      ? `Card 1 (${drawnCards[0]?.position}) — reuse the free-preview text provided above word-for-word as the first item, unchanged. Interpret the remaining cards in position order (the past life that shaped their personality today → why you found each other again) as a newly written, connected chronicle. Describe each past life's era, place, and form vividly. Connect it naturally to ${petInfo.name}'s personality today. (3-4 lines per remaining card) ${noMetaNote}`
      : `Interpret the three cards in position order (their earliest past life → the past life that shaped their personality today → why you found each other again) as one connected chronicle. Describe each past life's era, place, and form vividly. Connect it naturally to ${petInfo.name}'s personality today. (3-4 lines per card)`;
    const systemPrompt = `You are a channeler who imagines a pet's past life through tarot cards. Write warmly in English. This isn't a real prediction — it's an immersive, imaginative story, but tell it with genuine conviction. Always directly reference this pet's name and species. Never use generic phrasing. The message and closing sections must carry forward the actual meaning of the cards you already interpreted above — don't just drop a card's name in for decoration while the underlying content stays generic. Don't fill paragraphs with stock comfort lines ("I'm always with you," "I don't blame you") that could apply no matter which card was drawn; if the cards had been different, the core sentences of these sections should be different too.`;
    const userPrompt = `${petHeader}
Write a substantial, satisfying past-life story in the following three sections:

## 🕰️ Card-by-Card Past Life Interpretation
${cardInstruction}

## 💌 A Message From Their Past Life
Write as if those past-life selves have become one voice, speaking in ${petInfo.name}'s first person to "${petInfo.ownerTitle}." Express feeling and affection concretely. Carry forward the actual meaning of the cards from the past-life interpretation above — don't just drop a card's name in while the content stays unchanged. (6-8 lines)

## 🐾 Why You Found Each Other Again
Based on the overall flow of the cards, warmly explain why ${petInfo.name} and "${petInfo.ownerTitle}" found each other again in this life. Write something only this specific card combination could justify — avoid stock comfort lines that would fit any card draw. Include comfort and warmth. (4-5 lines)`;
    return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
  }

  const cardInstruction = freeReadingText
    ? `Card 1 (${drawnCards[0]?.position}) — reuse the free-preview text provided above word-for-word as the first item, unchanged. Interpret the remaining cards in combination with their position meanings (how the pet feels about their bond → how to strengthen the chemistry), newly written. Touch on the flow between the cards. (3-4 lines per remaining card) ${noMetaNote}`
    : `Interpret the three cards in combination with their position meanings (how the pet parent feels about their bond → how the pet feels about their bond → how to strengthen the chemistry). Touch on the flow between the cards. (3-4 lines per card)`;
  const systemPrompt = `You are a channeler who reads the chemistry between a pet parent and their pet through tarot cards. Write warmly in English. Always directly reference this pet's name and species. Never use generic phrasing. The letter section must carry forward the actual meaning of the cards you already interpreted above — don't just drop a card's name in for decoration while the underlying content stays generic.`;
  const userPrompt = `${petHeader}
Write a substantial, satisfying chemistry report in the following three sections:

## 💞 Card-by-Card Chemistry Interpretation
${cardInstruction}

## 💌 A Message From ${petInfo.name}
A first-person inner monologue from ${petInfo.name}, speaking directly and calling their person "${petInfo.ownerTitle}," in the form of an affectionate letter. Carry forward the actual meaning of the cards from the interpretation above — don't just drop a card's name in while the content stays unchanged. (6-8 lines)

## ✨ Tips to Strengthen the Chemistry
List three concrete, actionable tips based on the cards. Each item: **Tip title** — the reason and how to do it.`;
  return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
}

function buildPromptEn(snap, pastLossDetected) {
  if (snap.spreadKey === 'pastlife' || snap.spreadKey === 'chemistry') return buildStoryPromptEn(snap);
  const { petInfo, drawnCards, actionCards, fullName, freeReadingText } = commonParts(snap, 'en');
  const cardSummary = drawnCards.map(c => `[${c.position}] ${c.name}(${c.reversed ? 'Reversed' : 'Upright'})`).join('\n');
  const actionSummary = actionCards.length > 0
    ? actionCards.map(c => `${c.name}(${c.reversed ? 'Reversed' : 'Upright'})`).join(', ')
    : null;
  const speciesCtx = speciesContextEn(petInfo);
  const lossNote = pastLossDetected
    ? ` [Internal note only — do not quote this verbatim or cite "according to past records"] ${petInfo.name} appears to have already crossed the rainbow bridge based on prior readings. Adjust only the tone and tense naturally to reflect this.`
    : '';
  const systemPrompt = `You are a pet tarot expert. Write in warm, emotionally rich English. Always directly reference this pet's name, species, and concern. Never use generic phrasing. The heart-letter and message-for-you sections must carry forward the actual meaning of the cards you already interpreted above — don't just drop a card's name in for decoration while the underlying content stays generic. Don't fill paragraphs with stock comfort lines ("I'm always with you," "I don't blame you") that could apply no matter which card was drawn; if the cards had been different, the core sentences of these sections should be different too.${lossNote}`;
  const freeCtx = freeReadingText
    ? `\nCard 1 (${drawnCards[0]?.position}) was already shown in the free preview — reuse the text below word-for-word as the first item in the card-by-card section, do not rewrite or summarize it:\n${freeReadingText}\n`
    : '';
  const cardInstruction = freeReadingText
    ? `Card 1 (${drawnCards[0]?.position}) — reuse the free-preview text provided above word-for-word as the first item, unchanged. Interpret the remaining cards in combination with their position meanings, newly written. Connect it directly to ${petInfo.name}'s situation. Also touch on the flow and connections between the cards. (3-4 lines per remaining card) Never write meta-references like "as you saw in the preview" — this report must read as a single, complete, self-contained document.`
    : `Interpret each card in combination with its position's meaning. Connect it directly to ${petInfo.name}'s situation. Also touch on the flow and connections between the cards. (3-4 lines per card)`;
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
${cardInstruction}

## 💌 A Letter from ${petInfo.name}'s Heart
A first-person inner monologue from ${petInfo.name}, speaking directly and calling their person "${petInfo.ownerTitle}." Express feelings and wishes concretely. Carry forward the actual meaning of the cards from the position interpretation above — don't just drop a card's name in while the content stays unchanged. (6-8 lines)

## 🐾 A Message for You
Based on the overall flow of the cards, offer a perspective the pet parent may be missing, along with comfort and empathy. Write something only this specific card combination could justify — avoid stock comfort lines that would fit any card draw. Include a specific insight. (4-5 lines)

## ✨ Action Guide for What's Ahead
${actionSummary
  ? `Interpret the Action Guide Cards (${actionSummary}) and offer practical steps. Each item: **[Card Name]** — a concrete action and the reason for it. 1 to ${actionCards.length} items.`
  : `List three concrete, actionable steps based on the cards. Each item: **Action** — the reason and how to do it.`}`;

  return { system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
}

// snap.locale('ko' 기본/'ja'/'en')에 따라 프롬프트 생성
function buildPrompt(snap, pastLossDetected) {
  const locale = snap.locale === 'ja' ? 'ja' : snap.locale === 'en' ? 'en' : 'ko';
  if (locale === 'ja') return buildPromptJa(snap, pastLossDetected);
  if (locale === 'en') return buildPromptEn(snap, pastLossDetected);
  return buildPromptKo(snap, pastLossDetected);
}

// ── 과거 리딩 기반 펫 상태(사망/이별) 감지 ──
// 같은 유저·같은 펫 이름의 과거 완료된 딥리딩(concern/최종 리포트 텍스트)에
// 이별 관련 표현이 있었는지만 체크한다. 있으면 프롬프트에 "내부 참고" 힌트를
// 얹어 새 리딩의 톤/시제를 자연스럽게 맞추되, 이 사실 자체를 리딩 본문에
// 그대로 인용하거나 출처를 밝히지 않도록 지시한다.
const LOSS_KEYWORDS = [
  // ko
  '무지개다리', '무지개 다리', '하늘나라', '하늘로 떠', '별이 되', '안락사', '이별했', '떠나보내', '떠나 보내',
  // ja
  '虹の橋', '天国', '旅立', '安楽死', 'お別れ', '亡くなっ',
  // en
  'rainbow bridge', 'passed away', 'passed on', 'crossed over', 'euthaniz', 'in loving memory',
];

function textHasLossSignal(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  return LOSS_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

async function checkPastPetLoss(supabaseUrl, sbHeaders, userId, petName, excludeId) {
  if (!userId || !petName) return false;
  try {
    const url = `${supabaseUrl}/rest/v1/reading_history`
      + `?user_id=eq.${encodeURIComponent(userId)}`
      + `&pet_name=eq.${encodeURIComponent(petName)}`
      + `&status=eq.completed`
      + `&id=neq.${encodeURIComponent(excludeId)}`
      + `&select=concern,full_reading`
      + `&order=created_at.desc&limit=5`;
    const res = await fetch(url, { headers: sbHeaders });
    const rows = await res.json();
    if (!Array.isArray(rows)) return false;
    return rows.some(r => textHasLossSignal(r.concern) || textHasLossSignal(r.full_reading));
  } catch {
    return false;
  }
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

  // 결제 검증 통과 → 같은 유저·같은 펫의 과거 완료 리딩에 이별 신호가 있었는지 체크 후 프롬프트 재구성
  const pastLossDetected = await checkPastPetLoss(
    supabaseUrl, sbHeaders, row.user_id, row.pet_name, readingId
  );
  const { system, messages } = buildPrompt(snap, pastLossDetected);

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
