/**
 * catnat-arch.js  —  CATNAT Subscription Flow v1
 * ─────────────────────────────────────────────────────────────────────────────
 * Direct 4-step flow:
 *   Step 1 → choose plan + fill property details
 *   Step 2 → fill client info + select agency  →  submitAndProceed()
 *   Step 3 → CIB payment                       →  validateAndPay()
 *   Step 4 → real confirmation from API
 *
 * Mirrors roads-arch-v2.js exactly — only endpoint paths and field names differ.
 * NO review step. NO fake transitions. NO hardcoded pricing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const CATNAT_API = 'http://localhost:3000/api';

/* ═══════════════════════════════════════════════════════════════════════════
   1. APP STATE — single source of truth
   ═══════════════════════════════════════════════════════════════════════════ */
const AppState = (() => {
  const KEY = 'caar_catnat_v1';

  const DEFAULTS = () => ({
    step:     1,
    plan:     { id: null, name: null, price: 0 },
    property: {
      construction_type: '',
      usage_type:        '',
      built_area:        '',
      num_floors:        '',
      year_construction: '',
      declared_value:    '',
      wilaya_id:         '',
      city_id:           '',
      is_seismic_compliant: false,
      has_notarial_deed:    false,
      is_commercial:        false,
      extra_coverages:      [],
    },
    client: {
      title:         'Mr',
      first_name:    '',
      last_name:     '',
      email:         '',
      email_confirm: '',
      phone:         '',
      address:       '',
      city:          '',
      wilaya_id:     '',
    },
    agency_id: null,
    quoteId:   null,
    token:     null,
  });

  let _s = DEFAULTS();

  function _persist() {
    try { localStorage.setItem(KEY, JSON.stringify(_s)); } catch (_) {}
  }

  return {
    hydrate() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) _s = Object.assign(DEFAULTS(), JSON.parse(raw));
      } catch (_) {}
      return this;
    },

    set(path, value) {
      const parts = path.split('.');
      if (parts.length === 1) {
        _s[path] = (typeof value === 'object' && value !== null && !Array.isArray(value))
          ? Object.assign({}, _s[path] || {}, value)
          : value;
      } else {
        const [ns, key] = parts;
        _s[ns] = Object.assign({}, _s[ns] || {}, { [key]: value });
      }
      _persist();
    },

    get(key) { return key ? _s[key] : _s; },

    clear() {
      _s = DEFAULTS();
      localStorage.removeItem(KEY);
      ['caar_catnat_quote_id', 'token', 'caar_auth_token'].forEach(k => localStorage.removeItem(k));
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   2. UI HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
const UI = {
  el:    id  => document.getElementById(id),
  val:   id  => { const e = document.getElementById(id); return e ? e.value.trim() : ''; },
  selText: id => {
    const e = document.getElementById(id);
    return (e && e.options && e.selectedIndex >= 0) ? e.options[e.selectedIndex].text : '';
  },
  txt: (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; },

  fmtDZD: n =>
    Number(n).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DZD',

  fmtDate: iso => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },

  showError(containerId, msg) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.textContent = msg;
    el.style.cssText = [
      'display:block', 'background:#fff0f0', 'border:1px solid #e53e3e',
      'border-radius:8px', 'padding:12px 16px', 'color:#c53030',
      'font-size:0.82rem', 'font-weight:600', 'margin-bottom:12px',
    ].join(';');
    console.error('[CATNAT] Error:', msg);
  },

  hideError(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.style.display = 'none';
  },

  btnLoad(id, label) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = true;
    btn._v1_orig  = btn.innerHTML;
    btn.innerHTML = `⏳ ${label || 'Processing…'}`;
  },

  btnReset(id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = false;
    if (btn._v1_orig) btn.innerHTML = btn._v1_orig;
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   3. YN STATE  (seismic / notarial / commercial toggles)
   ═══════════════════════════════════════════════════════════════════════════ */
const _ynState   = { commercial: 'no', notarial: 'no', seismic: 'no' };
const _coverages = { floods: false, storms: false, ground: false };

/* Global hook kept for inline onclick= still present in step 1 HTML */
window.setYN = function (key, val) {
  _ynState[key] = val;
  const wrap = UI.el(`yn-${key}`);
  if (!wrap) return;
  wrap.querySelectorAll('.yn-btn').forEach(b => b.classList.remove('active'));
  const t = wrap.querySelector(`.yn-${val}`);
  if (t) t.classList.add('active');
  _updatePremiumDisplay();
};

window.toggleCoverage = function (key, btn) {
  _coverages[key] = !_coverages[key];
  if (_coverages[key]) { btn.innerHTML = '&#10003; Added'; btn.classList.add('added'); }
  else                 { btn.textContent = '+ Add';         btn.classList.remove('added'); }
  snapshotProperty();
  _updatePremiumDisplay();
};

window.spinUp = function (id, step) {
  const e = UI.el(id);
  if (e) { e.value = (parseFloat(e.value) || 0) + step; _updatePremiumDisplay(); }
};
window.spinDown = function (id, step) {
  const e = UI.el(id);
  if (e) { e.value = Math.max(parseFloat(e.min) || 0, (parseFloat(e.value) || 0) - step); _updatePremiumDisplay(); }
};

window.onConstructionTypeChange = () => _updatePremiumDisplay();
window.onWilayaChange           = () => {};
window.calculatePremium         = () => _updatePremiumDisplay();

/* Keep as no-ops — catnat-arch overrides agency loading */
window.updateAgencyList = () => {};
window.updateAgencyCard = () => {};

/* ── Premium display (uses plan price from AppState, not hardcoded math) ── */
function _updatePremiumDisplay() {
  const plan = AppState.get('plan');
  if (!plan || !plan.price) {
    UI.txt('net-premium', '0.00 DZD');
    UI.txt('tax-fees',    '0.00 DZD');
    UI.txt('total-pay',   '0.00 DZD');
    return;
  }
  const net   = plan.price;
  const tax   = net * 0.19;
  const total = net + tax;
  UI.txt('net-premium', UI.fmtDZD(net));
  UI.txt('tax-fees',    UI.fmtDZD(tax));
  UI.txt('total-pay',   UI.fmtDZD(total));
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. PLAN INJECTION
   ═══════════════════════════════════════════════════════════════════════════ */
const PLAN_SLOTS = [
  { cardId: 'plan-basique',  match: 'basique'  },
  { cardId: 'plan-plus',     match: 'plus'     },
  { cardId: 'plan-premium',  match: 'premium'  },
];

async function loadAndInjectPlans() {
  let plans = [];
  try {
    const res  = await fetch(`${CATNAT_API}/plans?product_name=Natural+Disaster+%28CATNAT%29`);
    const data = await res.json();
    plans = (data.plans || []).filter(p => Number(p.price) > 0);
    console.log('[CATNAT] Plans loaded:', plans.map(p => `${p.name}(id=${p.id})`).join(', '));
  } catch (err) {
    console.warn('[CATNAT] Plan fetch failed:', err.message);
  }

  PLAN_SLOTS.forEach((slot, idx) => {
    const plan = plans.length
      ? (plans.find(p => p.name.toLowerCase().startsWith(slot.match)) || plans[idx])
      : null;

    const card = UI.el(slot.cardId);
    if (!card) return;

    if (plan) {
      card.setAttribute('data-plan-id',    String(plan.id));
      card.setAttribute('data-plan-price', String(plan.price));
      card.setAttribute('data-plan-name',  plan.name);

      const nameEl  = card.querySelector('.plan-name');
      if (nameEl)  nameEl.textContent = plan.name;

      const priceEl = card.querySelector('.plan-price');
      if (priceEl) priceEl.textContent = Number(plan.price).toLocaleString('fr-DZ') + ' DZD';

      const features = Array.isArray(plan.features) ? plan.features : [];
      if (features.length) {
        const listEl = card.querySelector('.plan-features');
        if (listEl) listEl.innerHTML = features.map(f => `<li>${f}</li>`).join('');
      }
    } else {
      /* positional fallback: plan ids 7, 8, 9 for CATNAT in the DB */
      const priceEl  = card.querySelector('.plan-price');
      const rawPrice = priceEl ? priceEl.textContent.replace(/[^\d]/g, '') : '0';
      const nameEl   = card.querySelector('.plan-name');
      card.setAttribute('data-plan-id',    String(idx + 7));
      card.setAttribute('data-plan-price', rawPrice);
      card.setAttribute('data-plan-name',  nameEl ? nameEl.textContent.trim() : slot.match);
    }

    /* Remove legacy onclick; attach clean listener */
    card.removeAttribute('onclick');
    card.addEventListener('click', () => _selectPlanCard(card));
  });

  /* Restore previously selected plan, default to Plus */
  const saved = AppState.get('plan');
  if (saved && saved.id) {
    const savedCard = document.querySelector(`[data-plan-id="${saved.id}"]`);
    if (savedCard) { _selectPlanCard(savedCard); return; }
  }
  const plusCard = UI.el('plan-plus');
  if (plusCard && plusCard.getAttribute('data-plan-id')) _selectPlanCard(plusCard);
}

function _selectPlanCard(card) {
  const id    = parseInt(card.getAttribute('data-plan-id'),    10);
  const price = parseFloat(card.getAttribute('data-plan-price'));
  const name  = card.getAttribute('data-plan-name') || '';

  if (!id || isNaN(id) || isNaN(price)) {
    console.warn('[CATNAT] _selectPlanCard: invalid attributes on', card.id,
                 '— id:', card.getAttribute('data-plan-id'),
                 'price:', card.getAttribute('data-plan-price'));
    return;
  }

  AppState.set('plan', { id, name, price });
  console.log('[CATNAT] Plan selected:', JSON.stringify(AppState.get('plan')));

  PLAN_SLOTS.forEach(slot => {
    const c = UI.el(slot.cardId);
    if (!c) return;
    c.classList.remove('selected');
    const r = c.querySelector('input[type="radio"]');
    if (r) r.checked = false;
  });

  card.classList.add('selected');
  const radio = card.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;

  _updatePremiumDisplay();
}

/* Global shim for any remaining onclick="selectPlan(...)" attributes */
window.selectPlan = function (name, price, planId) {
  const id   = parseInt(planId, 10);
  const card = document.querySelector(`[data-plan-id="${id}"]`)
             || document.querySelector(`[data-plan-name="${name}"]`);

  if (card && card.getAttribute('data-plan-id')) {
    _selectPlanCard(card);
  } else {
    AppState.set('plan', { id: id || planId, name, price: parseFloat(price) });
    _updatePremiumDisplay();
    console.log('[CATNAT] selectPlan (fallback):', JSON.stringify(AppState.get('plan')));
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   5. AGENCIES — dynamic loading
   ═══════════════════════════════════════════════════════════════════════════ */
let _allAgencies    = [];
let _filteredByWilaya = [];

async function loadAgencies() {
  try {
    /* Try service-filtered first, fall back to all */
    const url = `${CATNAT_API}/agencies/filter?service=Habitation`;
    const res  = await fetch(url);
    _allAgencies = res.ok ? await res.json() : [];

    if (!_allAgencies.length) {
      const fallback = await fetch(`${CATNAT_API}/agencies`);
      if (fallback.ok) _allAgencies = await fallback.json();
    }

    console.log('[CATNAT] Agencies loaded:', _allAgencies.length);
    _populateWilayaFilter();
    _populateAgencySelect(_allAgencies);
  } catch (err) {
    console.warn('[CATNAT] Agency load failed:', err.message);
  }
}

function _populateWilayaFilter() {
  const select = UI.el('agency_wilaya');
  if (!select) return;

  const wilayaMap = new Map();
  _allAgencies.forEach(ag => {
    if (!wilayaMap.has(ag.wilaya_id)) {
      wilayaMap.set(ag.wilaya_id, ag.wilaya || `Wilaya ${ag.wilaya_id}`);
    }
  });

  select.innerHTML = '<option value="">All Wilayas</option>' +
    [...wilayaMap.entries()]
      .sort((a, b) => (a[1] < b[1] ? -1 : 1))
      .map(([id, name]) => `<option value="${id}">${name}</option>`)
      .join('');

  select.addEventListener('change', function () {
    const wid = parseInt(this.value, 10);
    const filtered = wid
      ? _allAgencies.filter(ag => ag.wilaya_id === wid)
      : _allAgencies;
    _populateAgencySelect(filtered);
  });
}

function _populateAgencySelect(list) {
  const select = UI.el('agency');
  if (!select) return;

  select.innerHTML = '<option value="">— Select agency —</option>' +
    list.map(ag =>
      `<option value="${ag.id}">${ag.agency_code} — ${ag.city}, ${ag.wilaya}</option>`
    ).join('');

  select.addEventListener('change', function () {
    AppState.set('agency_id', this.value ? parseInt(this.value, 10) : null);
    const ag = list.find(a => a.id === parseInt(this.value, 10));
    _updateAgencyCard(ag);
  });
}

function _updateAgencyCard(ag) {
  if (!ag) return;
  UI.txt('agency-card-name',  `Agency ${ag.agency_code} — ${ag.city}`);
  UI.txt('agency-card-addr',  ag.address || '');
  UI.txt('agency-card-phone', ag.phone   || '—');
  UI.txt('agency-card-fax',   ag.fax ? `Fax: ${ag.fax}` : '');
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. FIELD PERSISTENCE
   ═══════════════════════════════════════════════════════════════════════════ */
function snapshotProperty() {
  const extraCoverages = [];
  if (_coverages.floods) extraCoverages.push('floods');
  if (_coverages.storms) extraCoverages.push('storms');
  if (_coverages.ground) extraCoverages.push('ground');

  AppState.set('property', {
    construction_type:    UI.val('construction_type') || UI.selText('construction_type') || 'Individual Home',
    usage_type:           UI.val('usage_type')        || UI.selText('usage_type')        || 'Personal',
    built_area:           UI.val('built_area'),
    num_floors:           UI.val('num_floors')        || null,
    year_construction:    UI.val('year_construction'),
    declared_value:       UI.val('declared_value'),
    wilaya_id:            UI.val('wilaya')            || null,
    city_id:              null,                        /* municipality is text, not a city_id */
    is_seismic_compliant: _ynState.seismic    === 'yes',
    has_notarial_deed:    _ynState.notarial   === 'yes',
    is_commercial:        _ynState.commercial === 'yes',
    extra_coverages:      extraCoverages,
  });
}

function snapshotClient() {
  AppState.set('client', {
    title:         UI.val('title'),
    first_name:    UI.val('first_name'),
    last_name:     UI.val('last_name'),
    email:         UI.val('email'),
    email_confirm: UI.val('confirm_email'),
    phone:         UI.val('mobile_1'),
    address:       UI.val('address'),
    city:          UI.val('city'),
    wilaya_id:     UI.val('policy_wilaya') || null,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. VALIDATION
   ═══════════════════════════════════════════════════════════════════════════ */
function validateStep1() {
  const year     = parseInt(UI.val('year_construction'), 10);
  const area     = parseFloat(UI.val('built_area'));
  const declared = parseFloat(UI.val('declared_value'));
  const curYear  = new Date().getFullYear();

  if (!year || year < 1900 || year > curYear) {
    UI.showError('catnat-error-step1', `Year of construction must be between 1900 and ${curYear}.`);
    return false;
  }
  if (!area || area <= 0) {
    UI.showError('catnat-error-step1', 'Please enter the total built area.');
    return false;
  }
  if (!declared || declared <= 0) {
    UI.showError('catnat-error-step1', 'Please enter the declared value.');
    return false;
  }

  const planId = parseInt((AppState.get('plan') || {}).id, 10);
  if (!planId || isNaN(planId)) {
    UI.showError('catnat-error-step1', 'Please select an assistance plan above.');
    return false;
  }

  const terms = UI.el('terms-consent');
  if (!terms || !terms.checked) {
    UI.showError('catnat-error-step1', 'Please accept the general terms and conditions.');
    return false;
  }

  UI.hideError('catnat-error-step1');
  return true;
}

function validateStep2() {
  const c = AppState.get('client');

  if (!c.first_name || !c.first_name.trim()) {
    UI.showError('catnat-error-step2', 'Please enter your first name.');
    return false;
  }
  if (!c.last_name || !c.last_name.trim()) {
    UI.showError('catnat-error-step2', 'Please enter your last name.');
    return false;
  }
  if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
    UI.showError('catnat-error-step2', 'Please enter a valid email address.');
    return false;
  }
  if (c.email_confirm && c.email_confirm !== c.email) {
    UI.showError('catnat-error-step2', 'Email addresses do not match.');
    return false;
  }
  if (!c.phone) {
    UI.showError('catnat-error-step2', 'Please enter your phone number.');
    return false;
  }

  UI.hideError('catnat-error-step2');
  return true;
}

function validateCardFields() {
  const card  = (UI.val('card_number') || '').replace(/\s/g, '');
  const cvv   = UI.val('cvv2');
  const month = (UI.el('expiry_month') || {}).value;
  const year  = (UI.el('expiry_year')  || {}).value;
  const name  = UI.val('cardholder_name');

  if (card.length < 16) { UI.showError('pay-error-msg', 'Please enter a valid 16-digit card number.'); return false; }
  if (cvv.length   < 3) { UI.showError('pay-error-msg', 'Please enter a valid 3-digit CVV2.');         return false; }
  if (!month || !year)  { UI.showError('pay-error-msg', 'Please select the card expiry date.');         return false; }
  if (!name)            { UI.showError('pay-error-msg', 'Please enter the cardholder name.');           return false; }

  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. STEP NAVIGATION
   ═══════════════════════════════════════════════════════════════════════════ */
let _currentStep    = 1;
let _countdownTimer = null;

function _goToStep(n) {
  if (n < 1 || n > 4) return;
  const from = UI.el(`form-step-${_currentStep}`);
  const to   = UI.el(`form-step-${n}`);
  if (!to) return;
  if (from) from.classList.add('hidden');
  _currentStep = n;
  to.classList.remove('hidden');
  AppState.set('step', n);

  for (let i = 1; i <= 4; i++) {
    const ind = UI.el(`step-indicator-${i}`);
    if (!ind) continue;
    ind.classList.remove('active', 'done');
    if (i < n)        ind.classList.add('done');
    else if (i === n) ind.classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Override main.js goToStep */
window.goToStep = function goToStep(n) {
  if (n === 2) {
    snapshotProperty();
    if (!validateStep1()) return;
    _goToStep(2);
    return;
  }
  if (n === 1) { _goToStep(1); return; }
  /* Steps 3 and 4 are handled by submitAndProceed / validateAndPay */
};

/* ═══════════════════════════════════════════════════════════════════════════
   9. PAYMENT PAGE POPULATION
   ═══════════════════════════════════════════════════════════════════════════ */
function _populatePaymentPage() {
  const plan  = AppState.get('plan');
  const total = (plan.price || 0) * 1.19;
  UI.txt('pay-amount', UI.fmtDZD(total));
  UI.txt('pay-ref', `New Contract — CATNAT (${plan.name || 'Standard'})`);
  _startCountdown(300);
}

function _populateConfirmation(apiData) {
  if (apiData) {
    UI.txt('confirm-policy-ref', apiData.policy_reference || '—');
    UI.txt('confirm-dates',
      `Issued: ${UI.fmtDate(apiData.start_date)} · Valid until: ${UI.fmtDate(apiData.end_date)}`);
    UI.txt('confirm-amount', UI.fmtDZD(apiData.amount_paid));
    console.log('[CATNAT] Confirmation:', apiData.policy_reference);
  }
  AppState.clear();
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. COUNTDOWN
   ═══════════════════════════════════════════════════════════════════════════ */
function _startCountdown(seconds) {
  clearInterval(_countdownTimer);
  let remaining = seconds;

  function tick() {
    const m  = Math.floor(remaining / 60);
    const s  = remaining % 60;
    const el = UI.el('countdown');
    if (el) el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    if (remaining <= 0) clearInterval(_countdownTimer);
    remaining--;
  }

  tick();
  _countdownTimer = setInterval(tick, 1000);
}

/* ═══════════════════════════════════════════════════════════════════════════
   11. MAIN FLOW ORCHESTRATORS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * submitAndProceed — Step 2 → Step 3
 * 1. Snapshot all client + property data from DOM
 * 2. Validate required fields
 * 3. POST /api/catnat/quote        → receive quoteId + token
 * 4. POST /api/catnat/confirm/:id  → confirm the quote
 * 5. _goToStep(3)
 */
window.submitAndProceed = async function submitAndProceed() {
  /* Always snapshot before any reads */
  snapshotProperty();
  snapshotClient();

  UI.hideError('catnat-error-step2');

  if (!validateStep2()) return;

  const s      = AppState.get();
  const planId = parseInt((s.plan || {}).id, 10);

  if (!planId || isNaN(planId)) {
    UI.showError('catnat-error-step2',
      'Plan not available — please go back to Step 1 and select a plan.');
    console.warn('[CATNAT] submitAndProceed blocked — plan.id:', s.plan && s.plan.id);
    return;
  }

  /* Build API payload matching catnatController.js expectations exactly */
  const payload = {
    first_name:           s.client.first_name.trim(),
    last_name:            s.client.last_name.trim(),
    email:                s.client.email.trim().toLowerCase(),
    phone:                s.client.phone ? s.client.phone.trim() : null,
    construction_type:    s.property.construction_type  || 'Individual Home',
    usage_type:           s.property.usage_type         || 'Personal',
    built_area:           parseFloat(s.property.built_area)     || 0,
    num_floors:           s.property.num_floors                 || null,
    year_construction:    parseInt(s.property.year_construction, 10) || 0,
    declared_value:       parseFloat(s.property.declared_value) || 0,
    address:              s.client.address   || null,
    wilaya_id:            s.property.wilaya_id ? parseInt(s.property.wilaya_id, 10) : null,
    city_id:              s.property.city_id  ? parseInt(s.property.city_id,    10) : null,
    is_seismic_compliant: !!s.property.is_seismic_compliant,
    has_notarial_deed:    !!s.property.has_notarial_deed,
    is_commercial:        !!s.property.is_commercial,
    extra_coverages:      Array.isArray(s.property.extra_coverages) ? s.property.extra_coverages : [],
    plan_id:              planId,
  };

  console.log('CATNAT QUOTE PAYLOAD:', payload);

  UI.btnLoad('btn-pay-cib', 'Creating quote…');

  try {
    /* ── 1. Create quote ── */
    const quoteRes  = await fetch(`${CATNAT_API}/catnat/quote`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const quoteData = await quoteRes.json();

    if (!quoteRes.ok) {
      UI.btnReset('btn-pay-cib');
      UI.showError('catnat-error-step2', quoteData.error || `Quote failed: HTTP ${quoteRes.status}`);
      return;
    }

    AppState.set('quoteId', quoteData.quote_id);
    AppState.set('token',   quoteData.token);
    localStorage.setItem('token',                  quoteData.token);
    localStorage.setItem('caar_auth_token',         quoteData.token);
    localStorage.setItem('caar_catnat_quote_id',    String(quoteData.quote_id));

    console.log('[CATNAT] Quote created:', quoteData.quote_id);

    /* ── 2. Confirm quote ── */
    UI.btnLoad('btn-pay-cib', 'Confirming…');

    const confirmRes  = await fetch(`${CATNAT_API}/catnat/confirm/${quoteData.quote_id}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${quoteData.token}`,
      },
    });
    const confirmData = await confirmRes.json();

    if (!confirmRes.ok) {
      UI.btnReset('btn-pay-cib');
      UI.showError('catnat-error-step2',
        confirmData.error || `Confirmation failed: HTTP ${confirmRes.status}`);
      return;
    }

    console.log('[CATNAT] Quote confirmed:', quoteData.quote_id);

    UI.btnReset('btn-pay-cib');
    _populatePaymentPage();
    _goToStep(3);

  } catch (err) {
    UI.btnReset('btn-pay-cib');
    UI.showError('catnat-error-step2', 'Network error — please check your connection.');
    console.error('[CATNAT] submitAndProceed error:', err);
  }
};

/**
 * validateAndPay — Step 3 → Step 4
 * 1. Validate card fields
 * 2. POST /api/catnat/pay/:quoteId
 * 3. Receive policy_reference, start_date, end_date, amount_paid
 * 4. Populate confirmation page with REAL data
 * 5. _goToStep(4)
 */
window.validateAndPay = async function validateAndPay() {
  if (!validateCardFields()) return;

  UI.hideError('pay-error-msg');
  clearInterval(_countdownTimer);
  UI.btnLoad('btn-validate-pay', 'Processing payment…');

  const { quoteId, token } = AppState.get();

  if (!quoteId || !token) {
    UI.showError('pay-error-msg', 'Session expired — please go back to Step 1 and start again.');
    UI.btnReset('btn-validate-pay');
    return;
  }

  try {
    const res  = await fetch(`${CATNAT_API}/catnat/pay/${quoteId}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();

    if (!res.ok) {
      UI.btnReset('btn-validate-pay');
      UI.showError('pay-error-msg', data.error || `Payment failed: HTTP ${res.status}`);
      return;
    }

    console.log('[CATNAT] Payment processed:', data.policy_reference);
    UI.btnReset('btn-validate-pay');
    _populateConfirmation(data);
    _goToStep(4);

  } catch (err) {
    UI.btnReset('btn-validate-pay');
    UI.showError('pay-error-msg', 'Payment error — please try again.');
    console.error('[CATNAT] validateAndPay error:', err);
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   12. PAYMENT FORM HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
window.formatCardNumber = function (input) {
  const v = (input.value || '').replace(/\D/g, '').slice(0, 16);
  input.value = (v.match(/.{1,4}/g) || []).join(' ');
};

window.resetPaymentForm = function () {
  ['card_number', 'cvv2', 'cardholder_name'].forEach(id => {
    const el = UI.el(id); if (el) el.value = '';
  });
  ['expiry_month', 'expiry_year'].forEach(id => {
    const el = UI.el(id); if (el) el.selectedIndex = 0;
  });
  UI.hideError('pay-error-msg');
};

window.downloadCertificate = function () {
  alert('Your CATNAT certificate will be sent to your email address shortly.');
};

/* ═══════════════════════════════════════════════════════════════════════════
   13. EVENT LISTENERS  (replaces all inline onclick= attributes)
   ═══════════════════════════════════════════════════════════════════════════ */
function _attachListeners() {

  /* ── Step 1: recalculate premium on any field change ── */
  ['built_area', 'declared_value', 'year_construction'].forEach(id => {
    const el = UI.el(id);
    if (el) el.addEventListener('input', _updatePremiumDisplay);
  });
  ['construction_type', 'usage_type', 'wilaya'].forEach(id => {
    const el = UI.el(id);
    if (el) el.addEventListener('change', _updatePremiumDisplay);
  });

  /* ── Step 1 → 2: "Continue to Purchase" ── */
  const btnContinueStep1 = UI.el('btn-continue-step1');
  if (btnContinueStep1) {
    btnContinueStep1.addEventListener('click', () => window.goToStep(2));
  }

  /* ── Step 2: "Back to Quote" ── */
  const btnBackStep2 = UI.el('btn-back-step2');
  if (btnBackStep2) {
    btnBackStep2.addEventListener('click', () => window.goToStep(1));
  }

  /* ── Step 2 → 3: "Continue to Payment" ── */
  const btnPayCib = UI.el('btn-pay-cib');
  if (btnPayCib) {
    btnPayCib.addEventListener('click', window.submitAndProceed);
  }

  /* ── Step 3: payment actions ── */
  const btnValidatePay = UI.el('btn-validate-pay');
  if (btnValidatePay) {
    btnValidatePay.addEventListener('click', window.validateAndPay);
  }

  const btnCancelPay = UI.el('btn-cancel-payment');
  if (btnCancelPay) {
    btnCancelPay.addEventListener('click', () => window.goToStep(2));
  }

  const btnResetPay = UI.el('btn-reset-payment');
  if (btnResetPay) {
    btnResetPay.addEventListener('click', window.resetPaymentForm);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   14. BOOT
   ═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async function boot() {
  console.log('[CATNAT] catnat-arch.js — booting');

  /* Always start fresh — no resume from stale state */
  AppState.clear();
  AppState.hydrate();

  /* Load data from API in parallel */
  await Promise.all([
    loadAndInjectPlans(),
    loadAgencies(),
  ]);

  /* Wire up all event listeners AFTER DOMContentLoaded so main.js
     global overrides are already in place, then we override them back */
  _attachListeners();

  /* Re-apply goToStep override after main.js IIFE has run */
  window.goToStep = function goToStep(n) {
    if (n === 2) { snapshotProperty(); if (!validateStep1()) return; _goToStep(2); return; }
    if (n === 1) { _goToStep(1); return; }
  };

  _updatePremiumDisplay();
  _goToStep(1);

  console.log('[CATNAT] Boot complete. Plan:', JSON.stringify(AppState.get('plan')));
});