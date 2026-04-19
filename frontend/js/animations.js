(function () {
  'use strict';

  document.documentElement.style.scrollBehavior = 'smooth';

  /* ── Animations simples (fade + slide) ── */
  var ANIMATIONS = [
    /* Hero — texte gauche, image droite */
    { sel: '.caar-hero__text',
      style: 'opacity:0;transform:translateX(-40px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .7s ease,transform .7s ease' },
    { sel: '.caar-hero__image',
      style: 'opacity:0;transform:translateX(40px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .7s ease .15s,transform .7s ease .15s' },
    { sel: '.caar-hero__tag',
      style: 'opacity:0;transform:translateY(-12px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .5s ease,transform .5s ease' },
    { sel: '.caar-hero__title',
      style: 'opacity:0;transform:translateY(20px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease .1s,transform .6s ease .1s' },
    { sel: '.caar-hero__subtitle',
      style: 'opacity:0;transform:translateY(16px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease .2s,transform .6s ease .2s' },
    { sel: '.caar-hero__actions',
      style: 'opacity:0;transform:translateY(14px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease .3s,transform .6s ease .3s' },

    /* Titres de sections */
    { sel: '.products-header',
      style: 'opacity:0;transform:translateY(30px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.why-header',
      style: 'opacity:0;transform:translateY(30px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.article-related__title',
      style: 'opacity:0;transform:translateY(20px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.advice-section__title',
      style: 'opacity:0;transform:translateY(20px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.articles-section__title',
      style: 'opacity:0;transform:translateY(20px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease,transform .6s ease' },

    /* Network section */
    { sel: '.network-left',
      style: 'opacity:0;transform:translateX(-36px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .7s ease,transform .7s ease' },
    { sel: '.network-illustration',
      style: 'opacity:0;transform:translateX(36px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .7s ease .1s,transform .7s ease .1s' },

    /* CTA */
    { sel: '.cta-inner',
      style: 'opacity:0;transform:translateY(24px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease,transform .6s ease' },

    /* Pages produits — sidebar + panel */
    { sel: '.product-sidebar',
      style: 'opacity:0;transform:translateX(-28px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.product-panel',
      style: 'opacity:0;transform:translateY(24px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease .1s,transform .6s ease .1s' },

    /* Pages articles */
    { sel: '.article-image',
      style: 'opacity:0;transform:translateY(28px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .7s ease,transform .7s ease' },
    { sel: '.article-section',
      style: 'opacity:0;transform:translateY(22px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.article-keypoints',
      style: 'opacity:0;transform:translateY(22px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease,transform .6s ease' },

    /* Company page */
    { sel: '.company-nav',
      style: 'opacity:0;transform:translateX(-24px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.company-content',
      style: 'opacity:0;transform:translateY(20px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease .1s,transform .6s ease .1s' },

    /* Contact page */
    { sel: '.contact-form-left',
      style: 'opacity:0;transform:translateX(-28px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.contact-other-ways',
      style: 'opacity:0;transform:translateX(28px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .6s ease .1s,transform .6s ease .1s' },

    /* Network page */
    { sel: '.network-hero-left',
      style: 'opacity:0;transform:translateX(-28px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.network-hero-map-slot',
      style: 'opacity:0;transform:translateX(28px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .6s ease .1s,transform .6s ease .1s' },

    /* Careers */
    { sel: '.why-lead',
      style: 'opacity:0;transform:translateY(20px)',
      anim:  'opacity:1;transform:translateY(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.apply-info',
      style: 'opacity:0;transform:translateX(-24px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .6s ease,transform .6s ease' },
    { sel: '.apply-form-card',
      style: 'opacity:0;transform:translateX(24px)',
      anim:  'opacity:1;transform:translateX(0);transition:opacity .6s ease .1s,transform .6s ease .1s' },
  ];

  /* ── Groupes stagger ── */
  var STAGGER_GROUPS = [
    { parent: '.products-grid',   child: '.product-card',        delay: 0.10 },
    { parent: '.why-grid',        child: '.why-card',            delay: 0.12 },
    { parent: '.why-circles',     child: '.circle',              delay: 0.10 },
    { parent: '.news-grid',       child: '.news-card',           delay: 0.10 },
    { parent: '.cards-grid',      child: '.prod-card',           delay: 0.08 },
    { parent: '.profiles-grid',   child: '.profile-card',        delay: 0.09 },
    { parent: '.why-grid-careers',child: '.why-card-careers',    delay: 0.09 },
    { parent: '.article-related__grid', child: '.article-related__card', delay: 0.09 },
    { parent: '.overview-stats',  child: '.stat-box',            delay: 0.10 },
    { parent: '.kf-grid',         child: '.kf-card',             delay: 0.09 },
    { parent: '.act-list',        child: '.act-card',            delay: 0.10 },
  ];

  /* ── Helpers ── */
  function camelize(str) {
    return str.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }

  function applyStyle(el, styleStr) {
    styleStr.split(';').forEach(function (rule) {
      var idx = rule.indexOf(':');
      if (idx < 0) return;
      var prop = rule.slice(0, idx).trim();
      var val  = rule.slice(idx + 1).trim();
      if (prop) el.style[camelize(prop)] = val;
    });
  }

  /* ── Init principal ── */
  function initAnimations() {
    if (window.__caarAnimDone) return;
    window.__caarAnimDone = true;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    var observed = [];

    /* Éléments simples */
    ANIMATIONS.forEach(function (cfg) {
      document.querySelectorAll(cfg.sel).forEach(function (el) {
        applyStyle(el, cfg.style);
        observed.push({ el: el, anim: cfg.anim, done: false });
      });
    });

    /* Stagger groups */
    STAGGER_GROUPS.forEach(function (grp) {
      document.querySelectorAll(grp.parent).forEach(function (parent) {
        Array.prototype.forEach.call(
          parent.querySelectorAll(grp.child),
          function (child, idx) {
            child.style.opacity   = '0';
            child.style.transform = 'translateY(28px)';
            var d = (idx * grp.delay).toFixed(2);
            observed.push({
              el:   child,
              done: false,
              anim: 'opacity:1;transform:translateY(0);' +
                    'transition:opacity .55s ease ' + d + 's,' +
                    'transform .55s ease ' + d + 's',
            });
          }
        );
      });
    });

    if (!observed.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        for (var i = 0; i < observed.length; i++) {
          if (observed[i].el === entry.target && !observed[i].done) {
            observed[i].done = true;
            applyStyle(observed[i].el, observed[i].anim);
            io.unobserve(entry.target);
            break;
          }
        }
      });
    }, { threshold: 0.10, rootMargin: '0px 0px -30px 0px' });

    observed.forEach(function (o) { io.observe(o.el); });
  }

  /* ── Lancement ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(initAnimations, 150);
    });
  } else {
    setTimeout(initAnimations, 150);
  }

})();