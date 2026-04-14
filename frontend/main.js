'use strict';

(function () {
  if (window.__caarAppReady) return;
  window.__caarAppReady = true;

  /* ── Base path ─────────────────────────────────────────── */
  function resolveBase() {
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].getAttribute('src');
      if (s && s.indexOf('main.js') !== -1)
        return s.replace(/main\.js.*$/, '');
    }
    var p = window.location.pathname;
    return p.slice(0, p.lastIndexOf('/') + 1);
  }

  /* ── Active nav ────────────────────────────────────────── */
  var PAGE_MAP = {
    'index':               'index', '':                  'index',
    'products':            'products',
    'individual-risks':    'products', 'auto-insurance':     'products',
    'transport-insurance': 'products', 'technical-risks':    'products',
    'industrial-risks':    'products', 'Online_subscription':'products',
    'catnat-subscription': 'products', 'roads':              'products',
    'company':             'company',  'company-careers':    'company',
    'network':             'network',
    'news':                'news',
    'article-accident':    'news',     'article-home':       'news',
    'article-business':    'news',     'article-basics':     'news',
    'contact':             'contact',
  };

  function setActiveNav() {
    var file = window.location.pathname.split('/').pop().replace('.html', '') || '';
    var page = PAGE_MAP[file] || '';
    if (!page) return;
    document.querySelectorAll('[data-page]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-page') === page);
    });
  }

  /* ── Header behaviour (search, lang, mobile nav) ──────── */
  function initHeader() {
    var header        = document.getElementById('caar-header');
    var searchBtn     = document.getElementById('searchBtn');
    var searchBar     = document.getElementById('searchBar');
    var searchClose   = document.getElementById('searchCloseHdr');
    var searchInput   = document.getElementById('searchInput');
    var langDropdown  = document.getElementById('langDropdown');
    var langToggle    = document.getElementById('langToggleBtn');
    var langMenu      = document.getElementById('langDropdownMenu');
    var currentLang   = document.getElementById('currentLang');
    var mobileBtn     = document.getElementById('mobileMenuBtn');
    var mobileNav     = document.getElementById('mobileNav');
    var mobileOverlay = document.getElementById('mobileNavOverlay');
    var mobileClose   = document.getElementById('mobileNavClose');

    /* Search */
    function openSearch() {
      if (!searchBar) return;
      searchBar.classList.add('open');
      searchBar.setAttribute('aria-hidden', 'false');
      if (searchInput) setTimeout(function () { searchInput.focus(); }, 60);
    }
    function closeSearch() {
      if (!searchBar) return;
      searchBar.classList.remove('open');
      searchBar.setAttribute('aria-hidden', 'true');
      if (searchInput) searchInput.value = '';
    }
    if (searchBtn) searchBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      searchBar && searchBar.classList.contains('open') ? closeSearch() : openSearch();
    });
    if (searchClose) searchClose.addEventListener('click', closeSearch);

    /* Language */
    function closeLang() {
      if (langMenu) langMenu.classList.remove('show');
      if (langDropdown) langDropdown.classList.remove('lang-open');
      if (langToggle) langToggle.setAttribute('aria-expanded', 'false');
    }
    if (langToggle) langToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (langMenu && langMenu.classList.contains('show')) { closeLang(); return; }
      if (langMenu) langMenu.classList.add('show');
      if (langDropdown) langDropdown.classList.add('lang-open');
      if (langToggle) langToggle.setAttribute('aria-expanded', 'true');
    });
    if (langMenu) langMenu.querySelectorAll('[data-lang]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (currentLang) currentLang.textContent = this.getAttribute('data-lang');
        closeLang();
      });
    });

    /* Mobile nav */
    function openMobile() {
      if (mobileNav)     { mobileNav.classList.add('open'); mobileNav.setAttribute('aria-hidden', 'false'); }
      if (mobileOverlay) mobileOverlay.classList.add('open');
      if (mobileBtn)     mobileBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
    function closeMobile() {
      if (mobileNav)     { mobileNav.classList.remove('open'); mobileNav.setAttribute('aria-hidden', 'true'); }
      if (mobileOverlay) mobileOverlay.classList.remove('open');
      if (mobileBtn)     mobileBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
    if (mobileBtn)     mobileBtn.addEventListener('click', openMobile);
    if (mobileClose)   mobileClose.addEventListener('click', closeMobile);
    if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobile);
    if (mobileNav) mobileNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMobile);
    });

    /* Escape key */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeSearch(); closeLang(); closeMobile();
    });

    /* Click-outside */
    document.addEventListener('click', function (e) {
      if (searchBar && searchBar.classList.contains('open'))
        if (!header || !header.contains(e.target)) closeSearch();
      if (langDropdown && !langDropdown.contains(e.target)) closeLang();
    });

    /* Touch dropdowns */
    if (header) {
      header.querySelectorAll('.dropdown').forEach(function (dd) {
        dd.addEventListener('touchstart', function (e) {
          var open = dd.classList.contains('touch-open');
          header.querySelectorAll('.dropdown.touch-open').forEach(function (x) {
            if (x !== dd) x.classList.remove('touch-open');
          });
          if (!open) { e.preventDefault(); dd.classList.add('touch-open'); }
          else dd.classList.remove('touch-open');
        }, { passive: false });
      });
      document.addEventListener('touchstart', function (e) {
        if (!e.target.closest || !e.target.closest('.dropdown'))
          header.querySelectorAll('.dropdown.touch-open').forEach(function (dd) {
            dd.classList.remove('touch-open');
          });
      }, { passive: true });
    }

    setActiveNav();

    /* ── AUTH HEADER — runs AFTER header is in DOM ── */
    if (typeof window.renderAuthHeader === 'function') {
      window.renderAuthHeader();
    }
  }

  /* ── Load fragment ─────────────────────────────────────── */
  function loadComponent(id, url, callback) {
    var el = document.getElementById(id);
    if (!el) { if (callback) callback(); return; }
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (html) { el.innerHTML = html; if (callback) callback(); })
      .catch(function (e) { console.warn('[CAAR] load failed:', url, e.message); if (callback) callback(); });
  }

  /* ── Boot ──────────────────────────────────────────────── */
  function boot() {
    var base = resolveBase();
    if (document.getElementById('site-header'))
      loadComponent('site-header', base + 'components/header.html', initHeader);
    else
      setActiveNav();

    if (document.getElementById('site-footer'))
      loadComponent('site-footer', base + 'components/footer.html', null);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else
    boot();
})();


/* ──────────────────────────────────────────────────────────────
   INLINE STYLES — header layout + user menu
   Injected once so every page gets consistent header without
   needing a separate CSS file for these structural rules.
────────────────────────────────────────────────────────────── */
(function () {
  var s = document.createElement('style');
  s.textContent = [
    '.header{position:sticky;top:0;z-index:1000;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.09);}',
    '.header-inner{display:flex;align-items:stretch;padding:0 40px;min-height:80px;}',
    '.logo-block{display:flex;align-items:center;padding:10px 20px 10px 0;flex-shrink:0;border-right:1px solid #E0E0E0;}',
    '.logo-img{width:110px;height:110px;object-fit:contain;display:block;}',
    '.right-side{display:flex;flex-direction:column;flex:1;}',
    '.top-row{display:flex;justify-content:flex-end;align-items:center;gap:14px;padding:10px 0 10px 20px;}',
    '.bottom-row{display:flex;align-items:center;justify-content:space-between;flex:1;}',

    /* Search bar */
    '.search-bar{display:flex;align-items:center;gap:12px;padding:0 40px;background:#fff;',
    'border-top:1px solid #e8e0d8;max-height:0;opacity:0;transform:translateY(-8px);',
    'pointer-events:none;overflow:hidden;',
    'transition:max-height .3s ease,opacity .3s ease,transform .3s ease,padding .3s ease;}',
    '.search-bar.open{max-height:72px;opacity:1;transform:translateY(0);pointer-events:auto;padding:14px 40px;}',
    '.hdr-search-input{flex:1;padding:11px 22px;border:1.5px solid #E8761E;border-radius:40px;',
    'font-size:.9rem;font-family:inherit;background:#f8f5f0;outline:none;color:#1c1c1c;',
    'transition:box-shadow .2s ease;}',
    '.hdr-search-input:focus{box-shadow:0 0 0 3px rgba(232,118,30,.15);}',
    '.search-close-hdr{background:none;border:none;cursor:pointer;font-size:1.1rem;color:#999;',
    'padding:6px 8px;border-radius:50%;transition:background .2s,color .2s;line-height:1;flex-shrink:0;}',
    '.search-close-hdr:hover{background:#f0f0f0;color:#333;}',

    /* Lang dropdown */
    '.lang-dropdown{position:relative;}',
    '.lang-dropdown-menu{position:absolute;top:calc(100% + 8px);right:0;background:#fff;',
    'border:1px solid #e8e0d8;border-radius:10px;min-width:155px;',
    'box-shadow:0 8px 24px rgba(0,0,0,.11);list-style:none;padding:5px 0;z-index:1010;',
    'opacity:0;transform:translateY(-8px);pointer-events:none;',
    'transition:opacity .22s ease,transform .22s ease;}',
    '.lang-dropdown-menu.show{opacity:1;transform:translateY(0);pointer-events:auto;}',
    '.lang-dropdown-menu li a{display:flex;align-items:center;gap:8px;padding:9px 14px;',
    'font-size:.83rem;font-weight:600;color:#1c1c1c;text-decoration:none;',
    'transition:background .15s,color .15s;}',
    '.lang-dropdown-menu li a:hover{background:#fff5e6;color:#F57C00;}',
    '.lang-dropdown.lang-open .lang-toggle-btn svg{transform:rotate(180deg);}',
    '.lang-toggle-btn svg{transition:transform .2s ease;}',

    /* User menu */
    '.user-menu{position:relative;}',
    '.user-trigger{display:flex;align-items:center;gap:8px;background:#E8761E;',
    'border:2px solid #E8761E;border-radius:30px;padding:9px 16px;cursor:pointer;',
    'font-size:14px;font-weight:600;color:#fff;transition:background .2s,transform .15s;',
    'white-space:nowrap;}',
    '.user-trigger:hover{background:#e06d00;border-color:#e06d00;transform:translateY(-1px);}',
    '.user-trigger svg{transition:transform .25s ease;flex-shrink:0;}',
    '.user-menu.open .user-trigger svg{transform:rotate(180deg);}',
    '.user-avatar{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.35);',
    'color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;',
    'justify-content:center;flex-shrink:0;letter-spacing:0;}',
    '.user-name{color:#fff;}',
    '.user-dropdown{position:absolute;top:calc(100% + 10px);right:0;background:#fff;',
    'border-radius:12px;min-width:200px;box-shadow:0 12px 32px rgba(0,0,0,.13);',
    'border:1px solid #f0ece6;padding:6px 0;z-index:9999;',
    'opacity:0;transform:translateY(8px);pointer-events:none;',
    'transition:opacity .22s ease,transform .22s ease;}',
    '.user-menu.open .user-dropdown{opacity:1;transform:translateY(0);pointer-events:auto;}',
    '.user-dropdown-header{padding:12px 16px 10px;display:flex;flex-direction:column;gap:4px;}',
    '.user-dropdown-header span:first-child{font-size:.88rem;font-weight:700;color:#1a1a1a;}',
    '.user-role-badge{font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;',
    'padding:2px 8px;border-radius:20px;background:#fff5e6;color:#E8761E;width:fit-content;}',
    '.user-dropdown-divider{border:none;border-top:1px solid #f0ece6;margin:4px 0;}',
    '.user-dropdown-item{display:flex;align-items:center;gap:10px;padding:10px 16px;',
    'font-size:.84rem;font-weight:600;color:#333;cursor:pointer;',
    'transition:background .15s,color .15s;text-decoration:none;background:none;',
    'border:none;width:100%;text-align:left;font-family:inherit;}',
    '.user-dropdown-item:hover{background:#fff8f2;color:#E8761E;}',
    '.user-logout{color:#c0392b;}',
    '.user-logout:hover{background:#fff5f5;color:#c0392b;}',

    /* Mobile */
    '@media(max-width:768px){',
    '.nav-links,.top-row,.top-divider,.divider{display:none;}',
    '.mobile-menu-btn{display:flex!important;}',
    '.logo-img{width:72px;height:72px;}',
    '.search-bar.open{padding:10px 16px;}',
    '}',
  ].join('');
  document.head.appendChild(s);
})();


/* ──────────────────────────────────────────────────────────────
   PAGE-SPECIFIC GLOBALS (product sidebar, company tabs, etc.)
────────────────────────────────────────────────────────────── */

window.show = function (k, btn) {
  document.querySelectorAll('.detail').forEach(function (p) { p.classList.remove('on'); });
  document.querySelectorAll('.sidebar-btn').forEach(function (b) { b.classList.remove('active'); });
  var t = document.getElementById('d-' + k);
  if (t) t.classList.add('on');
  if (btn) btn.classList.add('active');
  var bc = document.getElementById('bc');
  if (bc && btn) {
    var title = btn.querySelector('div > div:first-child');
    if (title) bc.textContent = title.textContent;
  }
};

window.showTransport = window.show;

window.showTab = function (tabId, btn) {
  document.querySelectorAll('.tab-pane').forEach(function (el) { el.classList.remove('active'); });
  document.querySelectorAll('.company-nav-btn').forEach(function (b) { b.classList.remove('active'); });
  var pane = document.getElementById('tab-' + tabId);
  if (pane) pane.classList.add('active');
  if (btn) btn.classList.add('active');
};

window.toggleFullMessage = function () {
  var preview = document.getElementById('ld-preview');
  var full    = document.getElementById('ld-full-message');
  var btn     = document.getElementById('ld-read-btn');
  if (!preview || !full || !btn) return;
  var open = full.classList.contains('open');
  full.classList.toggle('open', !open);
  full.style.display  = open ? 'none' : 'block';
  preview.style.display = open ? '' : 'none';
  btn.style.display   = open ? '' : 'none';
};

/* Careers */
window.goToTab = function (tabName) {
  document.querySelectorAll('.careers-tab-content').forEach(function (el) { el.classList.remove('active'); });
  document.querySelectorAll('.careers-tab').forEach(function (b) { b.classList.remove('active'); });
  var c = document.getElementById('tab-' + tabName);
  if (c) c.classList.add('active');
  var b = document.querySelector('[data-tab="' + tabName + '"]');
  if (b) b.classList.add('active');
};

window.filterJobs = function (btn, category) {
  document.querySelectorAll('.jf-btn').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  var found = 0;
  document.querySelectorAll('.job-row').forEach(function (row) {
    var show = category === 'All' || row.getAttribute('data-dept') === category;
    row.style.display = show ? '' : 'none';
    if (show) found++;
  });
  var noFilter = document.getElementById('noFilterResults');
  if (noFilter) noFilter.style.display = found === 0 ? 'block' : 'none';
};

window.filterAndGo = function (category) {
  window.goToTab('jobs');
  setTimeout(function () {
    var btn = document.querySelector('.jf-btn[onclick*="' + category + '"]');
    if (btn) window.filterJobs(btn, category);
  }, 100);
};

window.handleCv = function (input) {
  var label = document.getElementById('cvLabel');
  if (label && input.files && input.files[0]) {
    label.textContent = input.files[0].name;
    var zone = document.getElementById('cvZone');
    if (zone) zone.classList.add('has-file');
  }
};

window.submitApplication = function () {
  var fields = [
    { id: 'afFirst',    errId: 'err-first',    min: 2 },
    { id: 'afLast',     errId: 'err-last',     min: 2 },
    { id: 'afEmail',    errId: 'err-email',    type: 'email' },
    { id: 'afField',    errId: 'err-field',    required: true },
    { id: 'afPosition', errId: 'err-position', min: 3 },
    { id: 'afMessage',  errId: 'err-message',  min: 20 },
  ];
  var ok = true;
  fields.forEach(function (f) {
    var el    = document.getElementById(f.id);
    var errEl = document.getElementById(f.errId);
    if (!el || !errEl) return;
    var val   = el.value.trim();
    var valid = true;
    if (f.min && val.length < f.min) valid = false;
    if (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(val)) valid = false;
    if (f.required && !val) valid = false;
    errEl.classList.toggle('show', !valid);
    el.classList.toggle('err', !valid);
    if (!valid) ok = false;
  });
  var cvInput = document.getElementById('afCv');
  var errCv   = document.getElementById('err-cv');
  if (cvInput && errCv) {
    var hasCv = !!(cvInput.files && cvInput.files.length);
    errCv.classList.toggle('show', !hasCv);
    var zone = document.getElementById('cvZone');
    if (zone) zone.classList.toggle('err', !hasCv);
    if (!hasCv) ok = false;
  }
  var consent    = document.getElementById('afConsent');
  var errConsent = document.getElementById('err-consent');
  if (consent && errConsent) {
    errConsent.classList.toggle('show', !consent.checked);
    if (!consent.checked) ok = false;
  }
  if (!ok) return;
  var ff = document.getElementById('careerFormFields');
  var sc = document.getElementById('careerSuccess');
  if (ff) ff.style.display = 'none';
  if (sc) sc.classList.add('show');
};

window.resetForm = function () {
  var ff = document.getElementById('careerFormFields');
  var sc = document.getElementById('careerSuccess');
  if (ff) ff.style.display = '';
  if (sc) sc.classList.remove('show');
};

/* Advice switch */
var _adviceKey = 'road';
window.switchAdvice = function (key, btn) {
  if (key === _adviceKey) return;
  var cur  = document.getElementById('advice-' + _adviceKey);
  var next = document.getElementById('advice-' + key);
  if (!cur || !next) return;
  cur.classList.add('is-leaving'); cur.classList.remove('is-active');
  setTimeout(function () {
    cur.classList.remove('is-leaving');
    document.querySelectorAll('.advice-category-btn').forEach(function (b) {
      b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false');
    });
    if (btn) { btn.classList.add('is-active'); btn.setAttribute('aria-selected', 'true'); }
    next.classList.add('is-active');
    _adviceKey = key;
  }, 200);
};

/* Scroll reveal */
document.addEventListener('DOMContentLoaded', function () {
  var els = document.querySelectorAll('.article-section, .article-keypoints, .scroll-reveal, .scroll-reveal-group');
  if (!els.length) return;
  var obs = new IntersectionObserver(function (entries, o) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible', 'is-revealed');
        o.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
  els.forEach(function (el, i) { el.style.transitionDelay = (i * 0.05) + 's'; obs.observe(el); });
});

/* Contact page — map + form */
document.addEventListener('DOMContentLoaded', function () {
  var hqMapEl = document.getElementById('hqMap');
  if (hqMapEl && typeof L !== 'undefined') {
    hqMapEl.style.cssText = 'width:100%;height:340px;display:block;';
    var HQ  = { lat: 36.767043, lng: 3.052792 };
    var map = L.map('hqMap', { center: [HQ.lat, HQ.lng], zoom: 16, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    var icon = L.divIcon({
      className: '',
      html: '<svg width="36" height="46" viewBox="0 0 36 46"><path d="M18 0C8.059 0 0 8.059 0 18 0 31.5 18 46 18 46S36 31.5 36 18C36 8.059 27.941 0 18 0Z" fill="#E8761E"/><circle cx="18" cy="18" r="9" fill="white"/></svg>',
      iconSize: [36, 46], iconAnchor: [18, 46], popupAnchor: [0, -50],
    });
    L.marker([HQ.lat, HQ.lng], { icon: icon }).addTo(map).bindPopup(
      '<strong>CAAR Headquarters</strong><br>48 Rue Didouche Mourad, Algiers'
    ).openPopup();
    setTimeout(function () { map.invalidateSize(); }, 200);
  }

  var form = document.getElementById('caarContactForm');
  if (!form) return;

  window.updateCharCount = function (textarea) {
    var count = textarea.value.length;
    var max   = parseInt(textarea.getAttribute('maxlength')) || 2000;
    var el    = document.getElementById('cfCharCount');
    if (!el) return;
    el.textContent = count + ' / ' + max;
    el.className = 'cf-char-count' + (count >= max ? ' over' : count > max * 0.9 ? ' warn' : '');
  };

  function showErr(inputId, errId) {
    var i = document.getElementById(inputId); var e = document.getElementById(errId);
    if (i) { i.classList.add('field-error'); i.classList.remove('field-ok'); }
    if (e) e.classList.add('visible');
  }
  function clearErr(inputId, errId) {
    var i = document.getElementById(inputId); var e = document.getElementById(errId);
    if (i) { i.classList.remove('field-error'); i.classList.add('field-ok'); }
    if (e) e.classList.remove('visible');
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var subject = (document.getElementById('cfSubject') || {}).value || '';
    var name    = ((document.getElementById('cfName')    || {}).value || '').trim();
    var email   = ((document.getElementById('cfEmail')   || {}).value || '').trim();
    var phone   = ((document.getElementById('cfPhone')   || {}).value || '').trim();
    var message = ((document.getElementById('cfMessage') || {}).value || '').trim();
    var consent = (document.getElementById('cfConsent') || {}).checked;
    var robot   = (document.getElementById('cfRobot')   || {}).checked;
    var hasErr  = false;

    if (!subject)                    { showErr('cfSubject', 'err-subject'); hasErr = true; } else clearErr('cfSubject', 'err-subject');
    if (name.length < 3)             { showErr('cfName', 'err-name');       hasErr = true; } else clearErr('cfName', 'err-name');
    if (!/^\S+@\S+\.\S+$/.test(email)){ showErr('cfEmail', 'err-email');   hasErr = true; } else clearErr('cfEmail', 'err-email');
    if (phone && !/^[0-9\s+\-()]{8,20}$/.test(phone)){ showErr('cfPhone', 'err-phone'); hasErr = true; } else clearErr('cfPhone', 'err-phone');
    if (message.length < 10)         { showErr('cfMessage', 'err-message'); hasErr = true; } else clearErr('cfMessage', 'err-message');
    var ec = document.getElementById('err-consent'); if (!consent) { if (ec) ec.classList.add('visible'); hasErr = true; } else if (ec) ec.classList.remove('visible');
    var rw = document.getElementById('cfRobotWrap'); var er = document.getElementById('err-robot');
    if (!robot) { if (rw) rw.classList.add('robot-error'); if (er) er.classList.add('visible'); hasErr = true; }
    else        { if (rw) rw.classList.remove('robot-error'); if (er) er.classList.remove('visible'); }

    if (hasErr) return;
    var btn = document.getElementById('sendBtn');
    if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; btn.classList.add('loading'); }
    try {
      var res = await fetch(window.CAAR_API || 'http://localhost:3000' + '/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var ff = document.getElementById('formFields');
      var ss = document.getElementById('successState');
      if (ff) ff.style.display = 'none';
      if (ss) ss.classList.add('show');
    } catch (_) { alert('Server error. Please try again.'); }
    finally { if (btn) { btn.disabled = false; btn.classList.remove('loading'); btn.textContent = 'Send my request'; } }
  });

  window.resetForm = window.resetForm || function () {
    form.reset();
    var ff = document.getElementById('formFields'); if (ff) ff.style.display = '';
    var ss = document.getElementById('successState'); if (ss) ss.classList.remove('show');
  };

  var formRevealed = false;
  var ctaBtn = document.getElementById('ctaBtn');
  if (ctaBtn) ctaBtn.addEventListener('click', function () {
    var section = document.getElementById('contactForm');
    if (!section) return;
    if (!formRevealed) { section.classList.add('show'); formRevealed = true; }
    setTimeout(function () { section.scrollIntoView({ behavior: 'smooth' }); }, 80);
  });

  window.collapseForm = function () {
    var section = document.getElementById('contactForm');
    if (section) section.classList.remove('show');
    formRevealed = false;
  };
});