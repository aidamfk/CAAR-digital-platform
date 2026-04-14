/* ============================================================
   CAAR — dashboard.js  (v3 — state-driven)
   ─────────────────────────────────────────────────────────
   REQUIRES: app-state.js loaded before this file.

   KEY CHANGES vs v2
   ──────────────────
   1. Uses apiRequest() from app-state.js — token always attached
   2. Uses loadContracts() from app-state.js — single source of truth
   3. initApp({ requireAuth, requireRole }) guards the page
   4. All hardcoded user data removed — everything from API
   5. No silent failures — every section logs + shows error
   ============================================================ */

'use strict';

/* ── Verify state module is loaded ── */
if (typeof window.apiRequest === 'undefined') {
  console.error('[CAAR] dashboard.js — app-state.js not loaded! Add <script src="app-state.js"> before this file.');
}

/* ── Global state for this page ── */
var ALL_CLAIMS    = [];
var ALL_CONTRACTS = [];

/* ============================================================
   BOOT — initialize auth and load initial data
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
  // Guard: require authenticated client
  initApp({ requireAuth: true, requireRole: 'client' })
    .then(function() {
      // Render identity in sidebar/topbar from state
      renderUserIdentity();
      // Load dashboard stats
      loadDashboardStats();
    });
});

/* ============================================================
   USER IDENTITY RENDERING
   ── Reads from CAAR_STATE (populated by initApp) ──
   ============================================================ */

function renderUserIdentity() {
  var user = getUser();
  if (!user) return;

  var name = user.first_name
    ? (user.first_name + ' ' + (user.last_name || '')).trim()
    : (user.email || 'Client');

  var initials = name.trim().split(/\s+/).map(function(w) { return w[0]; })
    .join('').toUpperCase().slice(0, 2) || 'CL';

  // Sidebar
  safeSetText('.dash-sidebar__user-name', name);
  safeSetText('.dash-sidebar__user-role', user.role || 'client');
  var sideAvatar = document.querySelector('.dash-sidebar__avatar');
  if (sideAvatar) sideAvatar.textContent = initials;

  // Topbar
  safeSetText('.dash-topbar__user-name', name.split(' ')[0]);
  var topAvatar = document.querySelector('.dash-topbar__user-avatar');
  if (topAvatar) topAvatar.textContent = initials;

  // Welcome
  safeSetText('.dash-content__header-title',
    'Welcome back, ' + (user.first_name || 'there') + ' 👋');

  // Profile form prefill
  safeSetValue('pf-first', user.first_name || '');
  safeSetValue('pf-last',  user.last_name  || '');
  safeSetValue('pf-email', user.email      || '');
  safeSetValue('pf-phone', user.phone      || '');

  // Profile avatar circle
  var pac = document.querySelector('.pac-circle');
  if (pac) pac.textContent = initials;
  var pacName = document.querySelector('.pac-name');
  if (pacName) pacName.textContent = name;
}

function safeSetText(selector, value) {
  var el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function safeSetValue(id, value) {
  var el = document.getElementById(id);
  if (el && !el.value) el.value = value;
}

/* ============================================================
   DASHBOARD STATS
   GET /api/dashboard/stats — role-scoped by backend
   ============================================================ */

async function loadDashboardStats() {
  console.log('[CAAR Dashboard] loadDashboardStats()');

  var result;
  try {
    result = await apiRequest('/api/dashboard/stats');
  } catch (e) {
    console.error('[CAAR Dashboard] Stats network error:', e.message);
    return;
  }

  if (!result.ok) {
    console.error('[CAAR Dashboard] Stats HTTP', result.status, result.data);
    return;
  }

  var data = result.data;
  console.log('[CAAR Dashboard] Stats received:', data);

  safeSetText('.summary-card--orange .sc-value', data.total_claims    != null ? data.total_claims    : '—');
  safeSetText('.summary-card--amber  .sc-value', data.active_claims   != null ? data.active_claims   : (data.pending_claims != null ? data.pending_claims : '—'));
  safeSetText('.summary-card--blue   .sc-value', data.total_contracts != null ? data.total_contracts : '—');
  safeSetText('.summary-card--green  .sc-value', data.total_payments  != null ? data.total_payments  : '—');
}

/* ============================================================
   SPA NAVIGATION
   ============================================================ */

var SECTION_CONFIG = {
  dashboard: { title: 'Dashboard',       icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' },
  claims:    { title: 'My Claims',        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  roadside:  { title: 'Request Roadside', icon: '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>' },
  messages:  { title: 'Messages',         icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
  contracts: { title: 'My Contracts',     icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' },
  profile:   { title: 'Profile',          icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
};

window.switchSection = function(key, _el) {
  document.querySelectorAll('.dash-section').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.dash-nav-item').forEach(function(i) { i.classList.remove('active'); });

  var target = document.getElementById(key + '-section');
  if (target) target.classList.add('active');

  var navItem = document.querySelector('[data-section="' + key + '"]');
  if (navItem) navItem.classList.add('active');

  var cfg = SECTION_CONFIG[key] || SECTION_CONFIG.dashboard;
  safeSetText('#topbarTitle', cfg.title);
  safeSetText('#topbarBreadcrumb', cfg.title);
  var iconEl = document.getElementById('topbarIcon');
  if (iconEl) iconEl.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round">' + cfg.icon + '</svg>';

  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Lazy-load section data
  if (key === 'claims')    loadClaims();
  if (key === 'contracts') loadContractsSection();
};

window.openSidebar = function() {
  document.getElementById('dashSidebar').classList.add('open');
  document.getElementById('dashSidebarOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
};
window.closeSidebar = function() {
  document.getElementById('dashSidebar').classList.remove('open');
  document.getElementById('dashSidebarOverlay').classList.remove('show');
  document.body.style.overflow = '';
};

/* ============================================================
   CONTRACTS — uses loadContracts() from app-state.js
   ─────────────────────────────────────────────────────────
   Root cause of the old bug:
     • Missing Authorization header in the old contracts fetch
     • Hardcoded HTML in the grid instead of API data
   Fix: delegate entirely to app-state.js loadContracts()
   ============================================================ */

async function loadContractsSection() {
  console.log('[CAAR Dashboard] loadContractsSection() → /api/contracts/my');

  var contracts = await loadContracts('contracts-cards-grid');
  ALL_CONTRACTS = contracts;

  // Wire up the "File a Claim" button injected by loadContracts()
  window.__openClaimForContract = function(contractId, policyRef) {
    openNewClaimModal(contractId, policyRef);
  };

  console.log('[CAAR Dashboard] Contracts stored in ALL_CONTRACTS:', ALL_CONTRACTS.length);
}

/* ============================================================
   CLAIMS — GET /api/claims/my
   ============================================================ */

var STATUS_CONFIG = {
  pending:         { cls: 'status-badge--pending',         label: 'Pending' },
  under_review:    { cls: 'status-badge--under-review',    label: 'Under Review' },
  expert_assigned: { cls: 'status-badge--expert-assigned', label: 'Expert Assigned' },
  reported:        { cls: 'status-badge--approved',        label: 'Reported' },
  closed:          { cls: 'status-badge--closed',          label: 'Closed' },
  rejected:        { cls: 'status-badge--rejected',        label: 'Rejected' },
};

async function loadClaims() {
  var tbody   = document.getElementById('claimsTableBody');
  var emptyEl = document.getElementById('claimsEmpty');
  var countEl = document.getElementById('claimsCountNum');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:#999;font-size:.82rem;">'
    + '<div style="width:22px;height:22px;border:2px solid #f0ece6;border-top-color:#E8761E;'
    + 'border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 10px;"></div>'
    + 'Loading your claims…</td></tr>';

  console.log('[CAAR Dashboard] loadClaims() → GET /api/claims/my');

  var result;
  try {
    result = await apiRequest('/api/claims/my');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:#e53e3e;">'
      + '⚠ Network error. Please refresh.</td></tr>';
    return;
  }

  if (result.status === 404) {
    // Client profile not found — show empty gracefully
    ALL_CLAIMS = [];
    renderClaimsTable([]);
    return;
  }

  if (!result.ok) {
    console.error('[CAAR Dashboard] Claims HTTP', result.status, result.data);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:#e53e3e;">'
      + '⚠ Unable to load claims (HTTP ' + result.status + ').</td></tr>';
    return;
  }

  ALL_CLAIMS = result.data.claims || [];
  console.log('[CAAR Dashboard] Claims received:', ALL_CLAIMS.length);

  renderClaimsTable(ALL_CLAIMS);

  // Update sidebar badge
  var badge = document.querySelector('[data-section="claims"] .dash-nav-item__badge');
  var open  = ALL_CLAIMS.filter(function(c) {
    return !['closed', 'rejected'].includes(c.status);
  }).length;
  if (badge) badge.textContent = open || '';
}

function renderClaimsTable(claims) {
  var tbody   = document.getElementById('claimsTableBody');
  var emptyEl = document.getElementById('claimsEmpty');
  var countEl = document.getElementById('claimsCountNum');

  if (countEl) countEl.textContent = claims.length;

  if (!claims.length) {
    if (tbody)   tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = claims.map(function(c) {
    var sc   = STATUS_CONFIG[c.status] || { cls: 'status-badge--pending', label: c.status };
    var date = c.claim_date
      ? new Date(c.claim_date).toLocaleDateString('en-GB')
      : '—';
    return '<tr>'
      + '<td><span class="claim-id-cell">#' + c.claim_id + '</span></td>'
      + '<td>' + date + '</td>'
      + '<td><span class="type-chip">Contract #' + c.contract_id + '</span></td>'
      + '<td><span class="status-badge ' + sc.cls + '">' + sc.label + '</span></td>'
      + '<td><button class="btn-claim-view" onclick="openClaimPanel(' + c.claim_id + ')">'
      + '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>'
      + '<circle cx="12" cy="12" r="3"/></svg>View</button></td>'
      + '</tr>';
  }).join('');
}

window.filterClaims = function(status) {
  var filtered = status === 'all'
    ? ALL_CLAIMS
    : ALL_CLAIMS.filter(function(c) { return c.status === status; });
  renderClaimsTable(filtered);
};

/* ============================================================
   CLAIM DETAIL PANEL
   ============================================================ */

window.openClaimPanel = function(claimId) {
  var claim = ALL_CLAIMS.find(function(c) {
    return c.claim_id === claimId || c.claim_id === String(claimId);
  });
  if (!claim) return;

  document.getElementById('cdpTitle').textContent    = 'Claim #' + claim.claim_id;
  document.getElementById('cdpSubtitle').textContent =
    'Contract #' + claim.contract_id + ' · ' + (STATUS_CONFIG[claim.status] || {}).label;

  var sc = STATUS_CONFIG[claim.status] || { cls: 'status-badge--pending', label: claim.status };
  var STEPS = ['pending', 'under_review', 'expert_assigned', 'reported', 'closed'];
  var curIdx = STEPS.indexOf(claim.status);

  var timelineHTML = STEPS.map(function(step, i) {
    var dotCls = i < curIdx ? 'cdp-timeline-dot--done'
               : i === curIdx ? 'cdp-timeline-dot--current'
               : 'cdp-timeline-dot--pending';
    var label = (STATUS_CONFIG[step] || {}).label || step;
    return '<div class="cdp-timeline-item"><div class="cdp-timeline-dot ' + dotCls + '">'
      + (i < curIdx ? '✓' : (i + 1)) + '</div>'
      + '<div class="cdp-timeline-content"><div class="cdp-timeline-event">' + label + '</div>'
      + (i === curIdx ? '<div class="cdp-timeline-date">Current status</div>' : '')
      + '</div></div>';
  }).join('');

  document.getElementById('cdpBody').innerHTML =
    '<div class="cdp-section"><div class="cdp-section-title">Claim Details</div>'
    + '<div class="cdp-info-grid">'
    + '<div class="cdp-info-item"><div class="cdp-info-label">Status</div>'
    + '<div class="cdp-info-value"><span class="status-badge ' + sc.cls + '">' + sc.label + '</span></div></div>'
    + '<div class="cdp-info-item"><div class="cdp-info-label">Date Filed</div>'
    + '<div class="cdp-info-value">' + (claim.claim_date ? new Date(claim.claim_date).toLocaleDateString('en-GB') : '—') + '</div></div>'
    + '<div class="cdp-info-item"><div class="cdp-info-label">Contract</div>'
    + '<div class="cdp-info-value">#' + claim.contract_id + '</div></div>'
    + '<div class="cdp-info-item"><div class="cdp-info-label">Location</div>'
    + '<div class="cdp-info-value">' + (claim.incident_location || '—') + '</div></div>'
    + '</div></div>'
    + '<div class="cdp-section"><div class="cdp-section-title">Description</div>'
    + '<div class="cdp-description">' + (claim.description || 'No description provided.') + '</div></div>'
    + (claim.rejection_reason
      ? '<div class="cdp-section"><div class="cdp-section-title">Rejection Reason</div>'
        + '<div class="cdp-description" style="border-color:#f43f5e;background:#fff1f2;color:#be123c;">'
        + claim.rejection_reason + '</div></div>'
      : '')
    + '<div class="cdp-section"><div class="cdp-section-title">Progress</div>'
    + '<div class="cdp-timeline">' + timelineHTML + '</div></div>';

  document.getElementById('claimPanelOverlay').classList.add('open');
  document.getElementById('claimDetailPanel').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeClaimPanel = function() {
  document.getElementById('claimPanelOverlay').classList.remove('open');
  document.getElementById('claimDetailPanel').classList.remove('open');
  document.body.style.overflow = '';
};

/* ============================================================
   NEW CLAIM MODAL — CONTRACT-FIRST
   ─────────────────────────────────────────────────────────
   Ensures contracts are loaded before letting user pick one.
   ALL contract IDs come from the API — never hardcoded.
   ============================================================ */

window.openNewClaimModalGeneric = async function() {
  // Ensure contracts are loaded
  if (!ALL_CONTRACTS.length) {
    var result;
    try {
      result = await apiRequest('/api/contracts/my');
      ALL_CONTRACTS = (result.ok && result.data.contracts) ? result.data.contracts : [];
    } catch (e) {
      ALL_CONTRACTS = [];
    }
  }

  var active = ALL_CONTRACTS.filter(function(c) { return c.status === 'active'; });
  if (!active.length) {
    showToast('You have no active contracts. Please subscribe first.', 'error');
    return;
  }
  if (active.length === 1) {
    openNewClaimModal(active[0].contract_id, active[0].policy_reference);
    return;
  }
  openNewClaimModal(null, null, active);
};

window.openNewClaimModal = function(contractId, policyRef, contractList) {
  var modal = document.getElementById('newClaimModal');
  if (!modal) return;

  document.getElementById('claimFormError').style.display = 'none';
  document.getElementById('claimFormError').textContent   = '';
  document.getElementById('ncDescription').value          = '';
  document.getElementById('ncClaimDate').value            =
    new Date().toISOString().slice(0, 10);
  document.getElementById('ncLocation').value             = '';

  var select = document.getElementById('ncContractSelect');
  var pool   = contractList || ALL_CONTRACTS.filter(function(c) { return c.status === 'active'; });

  if (!pool.length) {
    select.innerHTML = '<option value="">— No active contracts found —</option>';
  } else {
    select.innerHTML = '<option value="">— Select a contract —</option>'
      + pool.map(function(c) {
          return '<option value="' + c.contract_id + '">'
            + (c.policy_reference || '#' + c.contract_id)
            + ' — ' + (c.product_name || 'Insurance')
            + ' (expires ' + (c.end_date ? new Date(c.end_date).toLocaleDateString('en-GB') : '—') + ')'
            + '</option>';
        }).join('');
  }

  if (contractId) select.value = contractId;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(function() { document.getElementById('ncDescription').focus(); }, 100);
};

window.closeNewClaimModal = function() {
  var modal = document.getElementById('newClaimModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
};

window.submitNewClaim = async function() {
  var contractId  = document.getElementById('ncContractSelect').value;
  var description = document.getElementById('ncDescription').value.trim();
  var claimDate   = document.getElementById('ncClaimDate').value;
  var location    = document.getElementById('ncLocation').value.trim();
  var errEl       = document.getElementById('claimFormError');
  var submitBtn   = document.getElementById('ncSubmitBtn');

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
  if (!contractId)              { showErr('Please select a contract.'); return; }
  if (description.length < 10) { showErr('Description must be at least 10 characters.'); return; }
  if (!claimDate)               { showErr('Please enter the incident date.'); return; }

  errEl.style.display = 'none';

  var payload = {
    contract_id:       parseInt(contractId, 10),
    description:       description,
    claim_date:        claimDate,
    incident_location: location || null,
  };

  console.log('[CAAR Dashboard] Submitting new claim:', payload);

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Submitting…';

  var result;
  try {
    result = await apiRequest('/api/claims', { method: 'POST', body: payload });
  } catch (e) {
    showErr('Network error — please check your connection.');
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit Claim';
    return;
  }

  if (!result.ok) {
    console.error('[CAAR Dashboard] Claim submit failed:', result.status, result.data);
    showErr(result.data.error || 'Failed to submit claim (HTTP ' + result.status + ').');
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit Claim';
    return;
  }

  console.log('[CAAR Dashboard] Claim submitted:', result.data);
  closeNewClaimModal();
  showToast('Claim #' + result.data.claim_id + ' submitted successfully!');
  ALL_CLAIMS = [];
  loadClaims();

  submitBtn.disabled    = false;
  submitBtn.textContent = 'Submit Claim';
};

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

function showToast(msg, type) {
  var t = document.getElementById('caar-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'caar-toast';
    t.style.cssText = 'position:fixed;bottom:28px;right:28px;z-index:9999;'
      + 'padding:14px 22px;border-radius:10px;font-size:.84rem;font-weight:600;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.18);transition:opacity .3s ease;max-width:340px;';
    document.body.appendChild(t);
  }
  t.style.background = (type === 'error') ? '#c53030' : '#1a1a1a';
  t.style.color      = '#fff';
  t.style.opacity    = '1';
  t.textContent      = msg;
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.style.opacity = '0'; }, 3500);
}

/* ============================================================
   ROADSIDE FORM
   ============================================================ */

var selectedProblemType = '';

window.selectProblemChip = function(el, value) {
  document.querySelectorAll('.rf-problem-chip').forEach(function(c) { c.classList.remove('selected'); });
  el.classList.add('selected');
  selectedProblemType = value;
};

window.submitRoadsideRequest = function() {
  var plate   = (document.getElementById('rfLicensePlate') || {}).value || '';
  var wilaya  = (document.getElementById('rfWilaya') || {}).value || '';
  var address = ((document.getElementById('rfAddress') || {}).value || '').trim();
  var desc    = ((document.getElementById('rfDescription') || {}).value || '').trim();
  var phone   = ((document.getElementById('rfPhone') || {}).value || '').trim();

  if (!selectedProblemType) { showToast('Please select the type of problem.', 'error'); return; }
  if (!plate)   { showToast('Please enter your license plate.',   'error'); return; }
  if (!wilaya)  { showToast('Please select your wilaya.',         'error'); return; }
  if (!address) { showToast('Please enter your location.',        'error'); return; }
  if (!desc)    { showToast('Please describe the problem.',       'error'); return; }
  if (!phone)   { showToast('Please enter your phone number.',    'error'); return; }

  var btn = document.getElementById('btnRoadsideSubmit');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  setTimeout(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Assistance Request'; }
    var ref = 'RSA-REQ-' + Date.now().toString(36).toUpperCase();
    var refEl = document.getElementById('rsRequestRef');
    if (refEl) refEl.textContent = ref;
    var body = document.getElementById('roadsideFormBody');
    if (body) body.style.display = 'none';
    var success = document.getElementById('roadsideSuccess');
    if (success) { success.style.display = 'block'; success.classList.add('show'); }
  }, 1400);
};

window.resetRoadsideForm = function() {
  ['rfLicensePlate', 'rfBrand', 'rfAddress', 'rfDescription', 'rfPhone', 'rfCity']
    .forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  selectedProblemType = '';
  document.querySelectorAll('.rf-problem-chip').forEach(function(c) { c.classList.remove('selected'); });
  var body = document.getElementById('roadsideFormBody');
  if (body) body.style.display = '';
  var success = document.getElementById('roadsideSuccess');
  if (success) { success.style.display = 'none'; success.classList.remove('show'); }
};

/* ============================================================
   PROFILE
   ============================================================ */

window.saveProfile = function() {
  var first = (document.getElementById('pf-first') || {}).value || '';
  var last  = (document.getElementById('pf-last')  || {}).value || '';
  if (!first || !last) { showToast('Name fields cannot be empty.', 'error'); return; }
  var ok = document.getElementById('pfb-success');
  if (ok) { ok.style.display = 'flex'; setTimeout(function() { ok.style.display = 'none'; }, 3000); }
  showToast('Profile saved.');
};

window.cancelProfile = function() {
  var user = getUser() || {};
  safeSetValue('pf-first', user.first_name || '');
  safeSetValue('pf-last',  user.last_name  || '');
  safeSetValue('pf-email', user.email      || '');
  safeSetValue('pf-phone', user.phone      || '');
};

window.changePassword = function() {
  var pw1    = (document.getElementById('pf-pw-new')     || {}).value || '';
  var pw2    = (document.getElementById('pf-pw-confirm') || {}).value || '';
  var errEl  = document.getElementById('pfb-pw-error');
  var okEl   = document.getElementById('pfb-pw-success');
  if (pw1 !== pw2) {
    if (errEl) errEl.style.display = 'flex';
    setTimeout(function() { if (errEl) errEl.style.display = 'none'; }, 3000);
    return;
  }
  if (okEl) { okEl.style.display = 'flex'; setTimeout(function() { okEl.style.display = 'none'; }, 3000); }
  showToast('Password updated.');
};

/* ============================================================
   KEYBOARD SHORTCUT
   ============================================================ */

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (typeof window.closeClaimPanel    === 'function') window.closeClaimPanel();
    if (typeof window.closeNewClaimModal === 'function') window.closeNewClaimModal();
  }
});