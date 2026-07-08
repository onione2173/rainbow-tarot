/* Header language switch dropdown. Mounts into any element with id="langSwitch".
   Reads the current language from <html lang> and the corresponding page URL
   from the <link rel="alternate" hreflang="..."> tags already present in <head>. */
(function () {
  function toPath(url) {
    try { return new URL(url, document.baseURI).pathname; } catch (e) { return url; }
  }

  function injectStyle() {
    if (document.getElementById('lang-switch-style')) return;
    var style = document.createElement('style');
    style.id = 'lang-switch-style';
    style.textContent =
      '.header-right{display:flex;align-items:center;gap:10px;}' +
      '.lang-switch{position:relative;}' +
      '.lang-switch-btn{display:flex;align-items:center;gap:4px;background:rgba(200,160,255,.08);border:1px solid rgba(200,160,255,.25);color:#e8d0ff;font-size:.78rem;font-weight:500;border-radius:20px;padding:6px 12px;cursor:pointer;white-space:nowrap;line-height:1.2;transition:background .15s,border-color .15s;}' +
      '.lang-switch-btn:hover{background:rgba(200,160,255,.16);border-color:rgba(200,160,255,.4);}' +
      '.lang-switch-caret{font-size:.65rem;opacity:.8;transition:transform .15s;display:inline-block;}' +
      '.lang-switch.open .lang-switch-caret{transform:rotate(180deg);}' +
      '.lang-switch-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:118px;background:rgba(18,12,34,.97);backdrop-filter:blur(18px);border:1px solid rgba(200,160,255,.25);border-radius:12px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.4);opacity:0;pointer-events:none;transform:translateY(-6px);transition:opacity .15s,transform .15s;z-index:300;}' +
      '.lang-switch-menu.open{opacity:1;pointer-events:auto;transform:translateY(0);}' +
      '.lang-switch-item{display:block;padding:9px 12px;border-radius:8px;font-size:.85rem;color:#c0aad8;text-decoration:none;white-space:nowrap;}' +
      '.lang-switch-item:hover{background:rgba(255,255,255,.06);color:#e8d0ff;}' +
      '.lang-switch-item.active{color:#e8d0ff;background:rgba(200,160,255,.12);font-weight:600;}' +
      '@media (max-width:380px){.lang-switch-btn{font-size:.72rem;padding:6px 9px;}}';
    document.head.appendChild(style);
  }

  function closeAll(root) {
    root.classList.remove('open');
    var menu = root.querySelector('.lang-switch-menu');
    var btn = root.querySelector('.lang-switch-btn');
    if (menu) menu.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function init() {
    var mount = document.getElementById('langSwitch');
    if (!mount) return;
    injectStyle();
    mount.classList.add('lang-switch');

    var curLang = document.documentElement.getAttribute('lang') === 'ja' ? 'ja' : 'ko';
    var koLink = document.querySelector('link[rel="alternate"][hreflang="ko"]');
    var jaLink = document.querySelector('link[rel="alternate"][hreflang="ja"]');
    var koHref = koLink ? toPath(koLink.getAttribute('href')) : '/';
    var jaHref = jaLink ? toPath(jaLink.getAttribute('href')) : '/ja/';
    var label = curLang === 'ja' ? '🌐 日本語' : '🌐 한국어';

    mount.innerHTML =
      '<button type="button" class="lang-switch-btn" aria-haspopup="true" aria-expanded="false">' + label + ' <span class="lang-switch-caret">▾</span></button>' +
      '<div class="lang-switch-menu" role="menu">' +
        '<a href="' + koHref + '" class="lang-switch-item' + (curLang === 'ko' ? ' active' : '') + '" role="menuitem">한국어</a>' +
        '<a href="' + jaHref + '" class="lang-switch-item' + (curLang === 'ja' ? ' active' : '') + '" role="menuitem">日本語</a>' +
      '</div>';

    var btn = mount.querySelector('.lang-switch-btn');
    var menu = mount.querySelector('.lang-switch-menu');

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !menu.classList.contains('open');
      closeAll(mount);
      if (willOpen) {
        mount.classList.add('open');
        menu.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('click', function (e) {
      if (!mount.contains(e.target)) closeAll(mount);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll(mount);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
