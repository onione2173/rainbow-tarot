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

let _sb = null;
if (_sbReady && window.supabase) {
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window._sb = _sb;
}

async function getUser() {
  if (!_sb) return null;
  const { data: { user } } = await _sb.auth.getUser();
  return user;
}

async function signOutUser() {
  if (_sb) await _sb.auth.signOut();
  window.location.href = '/';
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

async function updateMenuAuth() {
  try {
    const user = await getUser();
    const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
    const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    if (user) {
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
