/*
 * Supabase 설정 방법:
 * 1. supabase.com 에서 새 프로젝트 생성
 * 2. Settings > API 에서 Project URL과 anon key 복사
 * 3. 아래 두 값을 교체하세요
 * 4. Authentication > Providers > Kakao 활성화
 *    (Kakao Developers에서 앱 생성 후 REST API Key, Client Secret 입력)
 */
const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';

const _sbReady = SUPABASE_URL.includes('supabase.co') && !SUPABASE_URL.includes('YOUR_PROJECT');

// 신규 가입 1회만 Slack 알림을 보내도록 중복 방지 (브라우저 단위)
function maybeNotifySignup(user, session) {
  try {
    if (!user || user.is_anonymous) return;
    const createdAt = new Date(user.created_at).getTime();
    const lastSignIn = new Date(user.last_sign_in_at).getTime();
    const isFreshSignup = Math.abs(lastSignIn - createdAt) < 15000; // 생성 직후 첫 로그인만 "가입"으로 간주
    if (!isFreshSignup) return;
    const flagKey = 'petarot_signup_notified_' + user.id;
    if (localStorage.getItem(flagKey)) return;
    localStorage.setItem(flagKey, '1');
    if (typeof gtag === 'function') gtag('event', 'sign_up', { method: user.app_metadata?.provider || 'unknown' });
    fetch('/.netlify/functions/notify-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token }),
    }).catch(() => {});
  } catch {}
}

let _sb = null;
if (_sbReady && window.supabase) {
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window._sb = _sb;
  _sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      const user = session?.user;
      if (typeof gtag === 'function') gtag('event', 'login', { method: user?.app_metadata?.provider || 'unknown' });
      maybeNotifySignup(user, session);
    }
    if (event === 'SIGNED_OUT' && typeof gtag === 'function') gtag('event', 'logout');
  });
}

async function getUser() {
  if (!_sb) return null;
  const { data: { user } } = await _sb.auth.getUser();
  return user;
}

async function signOutUser() {
  if (_sb) await _sb.auth.signOut();
  // 현재 언어의 홈으로 복귀
  const p = window.location.pathname;
  window.location.href = p.startsWith('/en/') ? '/en/' : p.startsWith('/ja/') ? '/ja/' : '/';
}

async function signInWithKakao(redirectPath) {
  if (!_sb) {
    alert('서비스 준비 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: window.location.origin + (redirectPath || '/mypage/') }
  });
  if (error) alert('카카오 로그인 중 오류가 발생했습니다.\n' + error.message);
}

// OAuth 복귀는 항상 /auth-callback/ 경유(Supabase redirect 허용 목록에 등록된 경로).
// 복귀 후 이동할 경로는 petarot_dr._returnPath에 기록해 auth-callback이 읽는다.
function setAuthReturnPath(path) {
  try {
    let state = {};
    try { state = JSON.parse(localStorage.getItem('petarot_dr') || '{}'); } catch {}
    state._returnPath = path;
    state._savedAt = Date.now();
    localStorage.setItem('petarot_dr', JSON.stringify(state));
  } catch {}
}

// Google 로그인(en/ja 마이페이지 게이트용)
async function signInWithGoogle(returnPath) {
  if (!_sb) return { error: { message: 'not_configured' } };
  setAuthReturnPath(returnPath || window.location.pathname);
  return _sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/auth-callback/' }
  });
}

// 익명 세션 → Google 계정 연결(리딩 보관하기). 익명 user_id가 유지되어
// 기존 reading_history 소유가 그대로 계정으로 이어진다.
// Supabase에서 "Allow manual linking"이 켜져 있어야 한다.
async function linkGoogleIdentity(returnPath) {
  if (!_sb) return { error: { message: 'not_configured' } };
  setAuthReturnPath(returnPath || window.location.pathname);
  return _sb.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/auth-callback/' }
  });
}

async function updateMenuAuth() {
  try {
    const user = await getUser();
    const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
    const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    // 익명 세션은 메뉴상 비로그인으로 취급 — 로그아웃 노출 시 익명 리딩 소유권이 소실됨
    if (user && !user.is_anonymous) {
      hide('miSignup'); hide('miLogin');
      show('miMypage'); show('miLogout');
    } else {
      show('miSignup'); show('miLogin');
      show('miMypage'); hide('miLogout');
    }
  } catch (_) {}
}

function openMenu() {
  document.getElementById('menuDrawer')?.classList.add('show');
  document.getElementById('menuOverlay')?.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeMenu() {
  document.getElementById('menuDrawer')?.classList.remove('show');
  document.getElementById('menuOverlay')?.classList.remove('show');
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('hamburgerBtn')?.addEventListener('click', openMenu);
  document.getElementById('menuClose')?.addEventListener('click', closeMenu);
  document.getElementById('menuOverlay')?.addEventListener('click', closeMenu);
  document.getElementById('miLogout')?.addEventListener('click', signOutUser);
  updateMenuAuth();
});
