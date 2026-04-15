/**
 * roads-state.js  — v3  (logic-only, zero HTML changes)
 *
 * PLUGS INTO roads.html AS-IS.
 * Load AFTER the existing inline <script> so overrides take effect.
 *
 * Responsibilities:
 *  1. Fetch real plans → inject into existing plan cards
 *  2. Single localStorage state object (plan, vehicle, driver, quote)
 *  3. Override submitAndProceed()  (step 2 → 3)
 *  4. Override validateAndPay()    (step 3 → 4)
 *  5. In-page error display — no alert()
 *  6. Button loading guards — no double-submit
 *  7. Field auto-save + restore on refresh
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════════════════ */

var RS = {
  API:      'http://localhost:3000',
  STATE_KEY: 'caar_roads_v3',

  /** map card slot → plan name fragment (case-insensitive startsWith match) */
  CARD_SLOTS: [
    { cardId: 'plan-basic',   match: 'basic'   },
    { cardId: 'plan-plus',    match: 'plus'     },
    { cardId: 'plan-premium', match: 'premium'  },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   STATE  — single localStorage object
   ═══════════════════════════════════════════════════════════════════════════ */

var _state = (function () {
  function load() {
    try { return JSON.parse(localStorage.getItem(RS.STATE_KEY) || '{}'); }
    catch (_) { return {}; }
  }
  function save(patch) {
    var next = Object.assign(load(), patch);
    localStorage.setItem(RS.STATE_KEY, JSON.stringify(next));
    return next;
  }
  function clear() { localStorage.removeItem(RS.STATE_KEY); }
  function get(key) { return load()[key]; }

  return { load: load, save: save, clear: clear, get: get };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   PLAN INJECTION  — fetch real plans, inject into existing 3 cards
   ═══════════════════════════════════════════════════════════════════════════ */

async function _loadAndInjectPlans() {
  var plans;
  try {
    var res  = await fetch(RS.API + '/api/plans?product_name=Roadside+Assistance');
    var body = await res.json();
    plans    = (body.plans || []).filter(function (p) { return p.price > 0; });
  } catch (e) {
    _log('Plans fetch failed — keeping static cards:', e.message);
    return;
  }

  if (!plans.length) { _log('No plans returned — keeping static cards'); return; }

  /* Match each slot to an API plan by name */
  RS.CARD_SLOTS.forEach(function (slot) {
    var plan = plans.find(function (p) {
      return p.name.toLowerCase().indexOf(slot.match) === 0;
    });
    if (!plan) {
      /* Fallback: assign by index order if name doesn't match */
      var idx = RS.CARD_SLOTS.indexOf(slot);
      plan    = plans[idx] || null;
    }
    if (!plan) return;

    var card = document.getElementById(slot.cardId);
    if (!card) return;

    /* Store real DB id on card DOM */
    card.setAttribute('data-plan-id',    plan.id);
    card.setAttribute('data-plan-price', plan.price);
    card.setAttribute('data-plan-name',  plan.name);

    /* Update visible price */
    var priceEl = card.querySelector('.plan-price');
    if (priceEl) priceEl.textContent = _fmtDZD(plan.price, false);

    /* Update plan name label */
    var nameEl = card.querySelector('.plan-name');
    if (nameEl) nameEl.textContent = plan.name;

    /* Update features list if API returned them */
    var features = Array.isArray(plan.features) ? plan.features : [];
    if (features.length) {
      var listEl = card.querySelector('.plan-features');
      if (listEl) {
        listEl.innerHTML = features.map(function (f) {
          return '<li>' + _esc(String(f)) + '</li>';
        }).join('');
      }
    }

    /* Rebind click to use real plan_id  — DO NOT change class or layout */
    card.onclick = function () { _selectPlanByCard(card); };
  });

  _log('Plans injected from API:', plans.map(function (p) {
    return p.name + ' (id=' + p.id + ', ' + p.price + ' DZD)';
  }));

  /* Restore previously selected plan, or default to Plus */
  var savedPlanId = _state.get('planId');
  if (savedPlanId) {
    var savedCard = document.querySelector('[data-plan-id="' + savedPlanId + '"]');
    if (savedCard) { _selectPlanByCard(savedCard); return; }
  }
  /* Default: select the "Plus" slot */
  var plusCard = document.getElementById('plan-plus');
  if (plusCard && plusCard.getAttribute('data-plan-id')) {
    _selectPlanByCard(plusCard);
  }
}

/** Selects a plan card using its injected data-plan-* attributes */
function _selectPlanByCard(card) {
  var planId    = parseInt(card.getAttribute('data-plan-id'),    10);
  var planPrice = parseFloat(card.getAttribute('data-plan-price'));
  var planName  = card.getAttribute('data-plan-name')
                  || (card.querySelector('.plan-name') || {}).textContent
                  || 'Plan';

  /* Persist to state BEFORE calling the existing selectPlan so globals sync */
  _state.save({ planId: planId, planData: { id: planId, name: planName, price: planPrice } });

  /* Delegate visual selection + global variable update to the existing function */
  if (typeof window.selectPlan === 'function') {
    window.selectPlan(planName, planPrice, planId);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FIELD PERSISTENCE  — auto-save inputs to state, restore on reload
   ═══════════════════════════════════════════════════════════════════════════ */

var _VEHICLE_FIELDS = [
  { id: 'license_plate', key: 'license_plate' },
  { id: 'vehicle_brand', key: 'brand'          },
  { id: 'vehicle_model', key: 'model'          },
  { id: 'vehicle_year',  key: 'year'           },
  { id: 'wilaya',        key: 'wilaya'         },
];

var _DRIVER_FIELDS = [
  { id: 'title',         key: 'title'      },
  { id: 'first_name',    key: 'first_name' },
  { id: 'last_name',     key: 'last_name'  },
  { id: 'email',         key: 'email'      },
  { id: 'confirm_email', key: 'email_confirm' },
  { id: 'mobile_1',      key: 'phone'      },
];

function _saveVehicle() {
  var v = {};
  _VEHICLE_FIELDS.forEach(function (f) {
    var el = document.getElementById(f.id);
    if (el) v[f.key] = el.value;
  });
  _state.save({ vehicle: v });
}

function _saveDriver() {
  var d = {};
  _DRIVER_FIELDS.forEach(function (f) {
    var el = document.getElementById(f.id);
    if (el) d[f.key] = el.value;
  });
  _state.save({ driver: d });
}

function _restoreVehicle() {
  var v = _state.get('vehicle') || {};
  _VEHICLE_FIELDS.forEach(function (f) {
    var el = document.getElementById(f.id);
    if (el && v[f.key]) el.value = v[f.key];
  });
}

function _restoreDriver() {
  var d = _state.get('driver') || {};
  _DRIVER_FIELDS.forEach(function (f) {
    var el = document.getElementById(f.id);
    if (el && d[f.key]) el.value = d[f.key];
  });
}

function _attachFieldSavers() {
  _VEHICLE_FIELDS.forEach(function (f) {
    var el = document.getElementById(f.id);
    if (!el) return;
    el.addEventListener('input',  _saveVehicle);
    el.addEventListener('change', _saveVehicle);
  });
  _DRIVER_FIELDS.forEach(function (f) {
    var el = document.getElementById(f.id);
    if (!el) return;
    el.addEventListener('input',  _saveDriver);
    el.addEventListener('change', _saveDriver);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUTTON LOADING GUARD
   ═══════════════════════════════════════════════════════════════════════════ */

function _btnLoad(id, label) {
  var btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled  = true;
  btn._rs_orig  = btn.innerHTML;
  btn.innerHTML = '⏳ ' + (label || 'Processing…');
}

function _btnReset(id) {
  var btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled  = false;
  if (btn._rs_orig) btn.innerHTML = btn._rs_orig;
}

/* ═══════════════════════════════════════════════════════════════════════════
   IN-PAGE ERROR DISPLAY
   ═══════════════════════════════════════════════════════════════════════════ */

function _showErr(boxId, textId, msg) {
  var box  = document.getElementById(boxId);
  var text = document.getElementById(textId);
  if (text) text.textContent = msg;
  if (box)  box.style.display = 'block';
  _log('UI error [' + boxId + ']:', msg);
}

function _hideErr(boxId) {
  var box = document.getElementById(boxId);
  if (box) box.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════════════════════
   API HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/** POST /api/roadside/quote */
async function _apiCreateQuote() {
  /* Snapshot form values into state first */
  _saveVehicle();
  _saveDriver();

  var s = _state.load();
  var v = s.vehicle || {};
  var d = s.driver  || {};

  /* Resolve wilaya display text */
  var wilayaEl = document.getElementById('wilaya');
  var wilayaTxt = wilayaEl
    ? wilayaEl.options[wilayaEl.selectedIndex].text
    : (v.wilaya || null);

  var payload = {
    first_name:    (d.first_name || '').trim(),
    last_name:     (d.last_name  || '').trim(),
    email:         (d.email      || '').trim().toLowerCase(),
    phone:          d.phone ? d.phone.replace(/\s/g, '') : null,
    license_plate: (v.license_plate || '').toUpperCase().trim(),
    brand:         (v.brand  || '').trim(),
    model:         (v.model  || '').trim(),
    year:           parseInt(v.year, 10) || 0,
    wilaya:         wilayaTxt || null,
    plan_id:        s.planId  || null,  /* ← ALWAYS from state, never hardcoded */
  };

  _log('POST /api/roadside/quote', JSON.stringify(payload));

  var res  = await fetch(RS.API + '/api/roadside/quote', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  var data = await res.json();
  _log('Quote response', res.status, data);

  if (!res.ok) throw new Error(data.error || 'Failed to create quote (HTTP ' + res.status + ')');

  /* Persist token + quoteId — overwrite so inline script also sees the token */
  _state.save({ quoteId: data.quote_id, token: data.token });
  localStorage.setItem('token', data.token); /* kept for compatibility */

  /* Sync globals used by existing functions */
  window.quoteId   = data.quote_id;
  window.authToken = data.token;

  return data;
}

/** POST /api/roadside/confirm/:id */
async function _apiConfirm() {
  var s     = _state.load();
  var qId   = s.quoteId;
  var token = s.token;

  _log('POST /api/roadside/confirm/' + qId);

  var res  = await fetch(RS.API + '/api/roadside/confirm/' + qId, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + token,
    },
  });
  var data = await res.json();
  _log('Confirm response', res.status, data);

  if (!res.ok) throw new Error(data.error || 'Failed to confirm quote (HTTP ' + res.status + ')');
  return data;
}

/** POST /api/roadside/pay/:id */
async function _apiPay() {
  var s     = _state.load();
  var qId   = s.quoteId;
  var token = s.token;

  _log('POST /api/roadside/pay/' + qId);

  var res  = await fetch(RS.API + '/api/roadside/pay/' + qId, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({}),
  });
  var data = await res.json();
  _log('Pay response', res.status, data);

  if (!res.ok) throw new Error(data.error || 'Payment failed (HTTP ' + res.status + ')');
  return data;
}

/* ═══════════════════════════════════════════════════════════════════════════
   STEP INDICATOR SYNC  — shared helper so both overrides use the same logic
   ═══════════════════════════════════════════════════════════════════════════ */

function _syncStepIndicators(activeStep) {
  for (var i = 1; i <= 4; i++) {
    var ind = document.getElementById('step-indicator-' + i);
    if (!ind) continue;
    ind.classList.remove('active', 'done');
    if (i < activeStep)        ind.classList.add('done');
    else if (i === activeStep) ind.classList.add('active');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   OVERRIDE: submitAndProceed()  ← called by btn-pay-cib
   Flow: validate consents → POST quote → POST confirm → show step 3
   ═══════════════════════════════════════════════════════════════════════════ */

window.submitAndProceed = async function submitAndProceed() {
  /* Consent validation — uses existing checkbox IDs */
  if (!_chk('confirm-info')) {
    _showErr('api-error-msg', 'api-error-text',
      'Please confirm that all information is correct.');
    return;
  }
  if (!_chk('confirm-terms')) {
    _showErr('api-error-msg', 'api-error-text',
      'Please accept the general terms and conditions.');
    return;
  }

  _hideErr('api-error-msg');
  _btnLoad('btn-pay-cib', 'Creating quote…');

  try {
    /* Step A: create quote */
    await _apiCreateQuote();

    _btnLoad('btn-pay-cib', 'Confirming…');

    /* Step B: confirm (pending → confirmed) */
    await _apiConfirm();

    _btnReset('btn-pay-cib');

    /* Step C: advance UI to payment (step 3) — uses existing populatePayment */
    if (typeof window.populatePayment === 'function') window.populatePayment();

    document.getElementById('form-step-2').classList.add('hidden');
    document.getElementById('form-step-3').classList.remove('hidden');
    window.currentStep = 3;
    _syncStepIndicators(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    _btnReset('btn-pay-cib');
    _showErr('api-error-msg', 'api-error-text', err.message);
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   OVERRIDE: validateAndPay()  ← called by btn-validate-pay
   Flow: validate card UI → POST pay → populate confirmation → show step 4
   ═══════════════════════════════════════════════════════════════════════════ */

window.validateAndPay = async function validateAndPay() {
  /* Client-side card field validation (IDs unchanged from original HTML) */
  var cardNum  = (_val('card_number') ).replace(/\s/g, '');
  var cvv      =  _val('cvv2');
  var month    =  _val('expiry_month');
  var year     =  _val('expiry_year');
  var holder   =  _val('cardholder_name');

  if (cardNum.length < 16) {
    _showErr('pay-error-msg', 'pay-error-text', 'Please enter a valid 16-digit card number.');
    return;
  }
  if (cvv.length < 3) {
    _showErr('pay-error-msg', 'pay-error-text', 'Please enter a valid 3-digit CVV2.');
    return;
  }
  if (!month || !year) {
    _showErr('pay-error-msg', 'pay-error-text', 'Please select the card expiry date.');
    return;
  }
  if (!holder.trim()) {
    _showErr('pay-error-msg', 'pay-error-text', 'Please enter the cardholder name.');
    return;
  }

  _hideErr('pay-error-msg');
  _btnLoad('btn-validate-pay', 'Processing payment…');
  clearInterval(window.countdownTimer); /* stop the session countdown */

  try {
    var result = await _apiPay();

    _btnReset('btn-validate-pay');

    /* Populate confirmation with REAL API data */
    _populateConfirmation(result);

    /* Clear sensitive state now that flow is complete */
    _state.clear();

    /* Advance to step 4 */
    document.getElementById('form-step-3').classList.add('hidden');
    document.getElementById('form-step-4').classList.remove('hidden');
    window.currentStep = 4;
    _syncStepIndicators(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    _btnReset('btn-validate-pay');
    _showErr('pay-error-msg', 'pay-error-text', err.message);
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIRMATION POPULATE  — uses real API payload
   ═══════════════════════════════════════════════════════════════════════════ */

function _populateConfirmation(data) {
  var s        = _state.load(); /* may be empty if just cleared — read before clear */
  var planData = s.planData || {};

  var ref    = data.policy_reference || '—';
  var startF = _isoToDisplay(data.start_date);
  var endF   = _isoToDisplay(data.end_date);
  var amount = data.amount_paid != null
    ? _fmtDZD(data.amount_paid, true)
    : _fmtDZD(window.selectedPrice || 0, true);
  var planName = planData.name || window.selectedPlan || '—';

  _setText('confirm-policy-ref', ref);
  _setText('confirm-dates',  'Issued: ' + startF + ' · Valid until: ' + endF);
  _setText('confirm-amount', amount);
  _setText('confirm-plan',   planName);

  _log('Confirmation populated:', {
    policy_reference: ref,
    start_date: data.start_date,
    end_date:   data.end_date,
    amount_paid: data.amount_paid,
    contract_id: data.contract_id,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   MICRO-UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */

function _val(id) {
  var el = document.getElementById(id);
  return el ? (el.value || '') : '';
}

function _chk(id) {
  var el = document.getElementById(id);
  return !!(el && el.checked);
}

function _setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _isoToDisplay(iso) {
  if (!iso) return '—';
  var parts = iso.split('-');        /* YYYY-MM-DD */
  return parts.length === 3
    ? parts[2] + '/' + parts[1] + '/' + parts[0]
    : iso;
}

function _fmtDZD(n, withSuffix) {
  var formatted = Number(n).toLocaleString('fr-DZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSuffix ? formatted + ' DZD' : formatted + ' DZD';
}

function _esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _log() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift('[roads-state]');
  console.log.apply(console, args);
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {
  _log('init — loading real plans from API');

  /* 1. Fetch & inject real plan data into existing cards */
  _loadAndInjectPlans();

  /* 2. Restore saved vehicle + driver inputs (survives page refresh) */
  _restoreVehicle();
  _restoreDriver();

  /* 3. Wire auto-save on every field change */
  _attachFieldSavers();

  _log('init complete');
});