/* ============================================================
   CAAR — Client Dashboard JS  (v2 — backend-aligned)

   KEY FIXES vs previous version
   ──────────────────────────────
   1. Claims list   → GET /api/claims/my        (was /api/claims — admin)
   2. Contracts     → GET /api/contracts/my      (was hardcoded HTML)
   3. Claim create  → CONTRACT-FIRST flow
        a. Fetch user's active contracts
        b. User selects one
        c. POST /api/claims with that contract_id
   4. Dashboard stats → GET /api/dashboard/stats (unchanged but now robust)
   5. All IDs come from the API — ZERO hardcoded values.
   6. Role guard: only 'client' flows are used here.
============================================================ */

'use strict';

const API_BASE = 'http://localhost:3000';

/* ── 1. AUTH GUARD ─────────────────────────────────────────────────────── */
const AUTH_TOKEN = localStorage.getItem('token')
               || localStorage.getItem('caar_auth_token')
               || null;

if (!AUTH_TOKEN) {
  window.location.href = 'login.html';
}

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + AUTH_TOKEN,
};

/* ── 2. USER INFO (from localStorage, set by login.html) ──────────────── */
let CURRENT_USER = {};
try {
  CURRENT_USER = JSON.parse(localStorage.getItem('user') || '{}');
} catch (_) {}

/* ── 3. GLOBAL STATE ────────────────────────────────────────────────────── */
let ALL_CLAIMS    = [];   // populated by loadClaims()
let ALL_CONTRACTS = [];   // populated by loadContracts()

/* ============================================================
   UTILITIES
============================================================ */
function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB');
}

function fmtMoney(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-DZ', { minimumFractionDigits: 2 }) + ' DZD';
}

function showToast(msg, type = 'success') {
  // Simple toast — inject once, reuse
  let t = document.getElementById('caar-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'caar-toast';
    t.style.cssText = [
      'position:fixed;bottom:28px;right:28px;z-index:9999',
      'padding:14px 22px;border-radius:10px;font-size:.84rem;font-weight:600',
      'box-shadow:0 8px 24px rgba(0,0,0,.18);transition:opacity .3s ease',
      'max-width:340px;line-height:1.45',
    ].join(';');
    document.body.appendChild(t);
  }
  t.style.background = type === 'success' ? '#1a1a1a' : '#c53030';
  t.style.color      = '#fff';
  t.style.opacity    = '1';
  t.textContent      = msg;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3500);
}

/* ============================================================
   SPA NAVIGATION
============================================================ */
const SECTION_CONFIG = {
  dashboard: { title: 'Dashboard',       icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' },
  claims:    { title: 'My Claims',        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  roadside:  { title: 'Request Roadside', icon: '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>' },
  messages:  { title: 'Messages',         icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
  contracts: { title: 'My Contracts',     icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' },
  profile:   { title: 'Profile',          icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
};

window.switchSection = function (key, _clickedEl) {
  document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.dash-nav-item').forEach(i => i.classList.remove('active'));

  const target = document.getElementById(key + '-section');
  if (target) target.classList.add('active');

  const navItem = document.querySelector('[data-section="' + key + '"]');
  if (navItem) navItem.classList.add('active');

  const cfg = SECTION_CONFIG[key] || SECTION_CONFIG.dashboard;
  document.getElementById('topbarTitle').textContent      = cfg.title;
  document.getElementById('topbarBreadcrumb').textContent = cfg.title;
  document.getElementById('topbarIcon').innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round">' + cfg.icon + '</svg>';

  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Lazy-load section data on first visit
  if (key === 'claims')    loadClaims();
  if (key === 'contracts') loadContracts();
};

/* ── Mobile sidebar ── */
window.openSidebar = function () {
  document.getElementById('dashSidebar').classList.add('open');
  document.getElementById('dashSidebarOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
};
window.closeSidebar = function () {
  document.getElementById('dashSidebar').classList.remove('open');
  document.getElementById('dashSidebarOverlay').classList.remove('show');
  document.body.style.overflow = '';
};

/* ============================================================
   SECTION: DASHBOARD STATS
   GET /api/dashboard/stats  (role-scoped by backend)
============================================================ */
async function loadDashboardStats() {
  try {
    const res  = await fetch(API_BASE + '/api/dashboard/stats', { headers: HEADERS });
    if (res.status === 401) { handleUnauth(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();

    // Update summary cards with real numbers
    // backend returns: total_claims, total_contracts, pending_claims, total_payments, etc.
    safeSetText('.summary-card--orange .sc-value', data.total_claims    ?? '—');
    safeSetText('.summary-card--amber  .sc-value', data.active_claims   ?? data.pending_claims ?? '—');
    safeSetText('.summary-card--blue   .sc-value', data.total_contracts ?? '—');
    safeSetText('.summary-card--green  .sc-value', data.total_payments  ?? '—');

    // Also update user name in sidebar/topbar from localStorage
    renderUserIdentity();

  } catch (err) {
    console.error('[Dashboard] Stats error:', err.message);
    // Non-fatal — leave cards showing defaults
  }
}

function safeSetText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function renderUserIdentity() {
  const name     = CURRENT_USER.first_name
    ? CURRENT_USER.first_name + ' ' + (CURRENT_USER.last_name || '')
    : CURRENT_USER.email || 'Client';
  const initials = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'CL';

  // Sidebar
  safeSetText('.dash-sidebar__user-name', name.trim());
  safeSetText('.dash-sidebar__user-role', CURRENT_USER.role || 'client');
  const sideAvatar = document.querySelector('.dash-sidebar__avatar');
  if (sideAvatar) sideAvatar.textContent = initials;

  // Topbar
  safeSetText('.dash-topbar__user-name', name.split(' ')[0]);
  const topAvatar = document.querySelector('.dash-topbar__user-avatar');
  if (topAvatar) topAvatar.textContent = initials;

  // Welcome message
  safeSetText('.dash-content__header-title', 'Welcome back, ' + (CURRENT_USER.first_name || 'there') + ' 👋');
}

/* ============================================================
   SECTION: MY CLAIMS
   FIX: Was calling GET /api/claims (admin endpoint).
        Now correctly calls GET /api/claims/my (client endpoint).
============================================================ */
const STATUS_CONFIG = {
  pending:         { cls: 'status-badge--pending',         label: 'Pending' },
  under_review:    { cls: 'status-badge--under-review',    label: 'Under Review' },
  expert_assigned: { cls: 'status-badge--expert-assigned', label: 'Expert Assigned' },
  reported:        { cls: 'status-badge--approved',        label: 'Reported' },
  closed:          { cls: 'status-badge--approved',        label: 'Closed' },
  rejected:        { cls: 'status-badge--rejected',        label: 'Rejected' },
};

async function loadClaims() {
  const tbody   = document.getElementById('claimsTableBody');
  const emptyEl = document.getElementById('claimsEmpty');
  const countEl = document.getElementById('claimsCountNum');

  if (!tbody) return;

  tbody.innerHTML = `
    <tr><td colspan="5" style="text-align:center;padding:32px;color:#999;font-size:.82rem;">
      <div style="width:22px;height:22px;border:2px solid #f0ece6;border-top-color:#E8761E;
           border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 10px;"></div>
      Loading your claims…
    </td></tr>`;

  try {
    // ✅ FIX: correct client-scoped endpoint
    const res = await fetch(API_BASE + '/api/claims/my', { headers: HEADERS });

    if (res.status === 401) { handleUnauth(); return; }
    if (res.status === 404) {
      // No client profile — show empty state gracefully
      ALL_CLAIMS = [];
      renderClaimsTable([]);
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    ALL_CLAIMS = data.claims || [];
    renderClaimsTable(ALL_CLAIMS);

    // Update badge in sidebar nav
    const badge = document.querySelector('[data-section="claims"] .dash-nav-item__badge');
    const open  = ALL_CLAIMS.filter(c => !['closed','rejected'].includes(c.status)).length;
    if (badge) badge.textContent = open || '';

  } catch (err) {
    console.error('[Claims] Load error:', err.message);
    tbody.innerHTML = `
      <tr><td colspan="5" style="text-align:center;padding:32px;color:#e53e3e;font-size:.82rem;">
        ⚠ Unable to load claims. Please try again.
      </td></tr>`;
  }
}

function renderClaimsTable(claims) {
  const tbody   = document.getElementById('claimsTableBody');
  const emptyEl = document.getElementById('claimsEmpty');
  const countEl = document.getElementById('claimsCountNum');

  if (countEl) countEl.textContent = claims.length;

  if (!claims.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = claims.map(c => {
    const sc   = STATUS_CONFIG[c.status] || { cls: 'status-badge--pending', label: c.status };
    const date = fmt(c.claim_date);
    return `<tr>
      <td><span class="claim-id-cell">#${c.claim_id}</span></td>
      <td>${date}</td>
      <td><span class="type-chip">Contract #${c.contract_id}</span></td>
      <td><span class="status-badge ${sc.cls}">${sc.label}</span></td>
      <td>
        <button class="btn-claim-view" onclick="openClaimPanel(${c.claim_id})">
          <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/></svg>
          View
        </button>
      </td>
    </tr>`;
  }).join('');
}

window.filterClaims = function (status) {
  const filtered = status === 'all'
    ? ALL_CLAIMS
    : ALL_CLAIMS.filter(c => c.status === status);
  renderClaimsTable(filtered);
};

/* ============================================================
   CLAIM DETAIL PANEL (slide-in)
============================================================ */
window.openClaimPanel = function (claimId) {
  const claim = ALL_CLAIMS.find(c =>
    c.claim_id === claimId || c.claim_id === String(claimId)
  );
  if (!claim) return;

  document.getElementById('cdpTitle').textContent    = 'Claim #' + claim.claim_id;
  document.getElementById('cdpSubtitle').textContent =
    'Contract #' + claim.contract_id + ' · ' + (STATUS_CONFIG[claim.status]?.label || claim.status);

  const sc = STATUS_CONFIG[claim.status] || { cls: 'status-badge--pending', label: claim.status };

  // Build timeline based on status
  const STEPS = ['pending','under_review','expert_assigned','reported','closed'];
  const curIdx = STEPS.indexOf(claim.status);
  const timelineHTML = STEPS.map((step, i) => {
    const dotCls = i < curIdx ? 'cdp-timeline-dot--done'
                 : i === curIdx ? 'cdp-timeline-dot--current'
                 : 'cdp-timeline-dot--pending';
    const label = STATUS_CONFIG[step]?.label || step;
    return `<div class="cdp-timeline-item">
      <div class="cdp-timeline-dot ${dotCls}">${i < curIdx ? '✓' : i + 1}</div>
      <div class="cdp-timeline-content">
        <div class="cdp-timeline-event">${label}</div>
        ${i === curIdx ? '<div class="cdp-timeline-date">Current status</div>' : ''}
      </div>
    </div>`;
  }).join('');

  document.getElementById('cdpBody').innerHTML = `
    <div class="cdp-section">
      <div class="cdp-section-title">Claim Details</div>
      <div class="cdp-info-grid">
        <div class="cdp-info-item">
          <div class="cdp-info-label">Status</div>
          <div class="cdp-info-value">
            <span class="status-badge ${sc.cls}">${sc.label}</span>
          </div>
        </div>
        <div class="cdp-info-item">
          <div class="cdp-info-label">Date Filed</div>
          <div class="cdp-info-value">${fmt(claim.claim_date)}</div>
        </div>
        <div class="cdp-info-item">
          <div class="cdp-info-label">Contract</div>
          <div class="cdp-info-value">#${claim.contract_id}</div>
        </div>
        <div class="cdp-info-item">
          <div class="cdp-info-label">Location</div>
          <div class="cdp-info-value">${claim.incident_location || '—'}</div>
        </div>
      </div>
    </div>
    <div class="cdp-section">
      <div class="cdp-section-title">Description</div>
      <div class="cdp-description">${claim.description || 'No description provided.'}</div>
    </div>
    ${claim.rejection_reason ? `
    <div class="cdp-section">
      <div class="cdp-section-title">Rejection Reason</div>
      <div class="cdp-description" style="border-color:#f43f5e;background:#fff1f2;color:#be123c;">
        ${claim.rejection_reason}
      </div>
    </div>` : ''}
    <div class="cdp-section">
      <div class="cdp-section-title">Progress</div>
      <div class="cdp-timeline">${timelineHTML}</div>
    </div>`;

  document.getElementById('claimPanelOverlay').classList.add('open');
  document.getElementById('claimDetailPanel').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeClaimPanel = function () {
  document.getElementById('claimPanelOverlay').classList.remove('open');
  document.getElementById('claimDetailPanel').classList.remove('open');
  document.body.style.overflow = '';
};

/* ============================================================
   SECTION: MY CONTRACTS
   FIX: Was fully hardcoded HTML.
        Now loads from GET /api/contracts/my.
============================================================ */
async function loadContracts() {
  const grid = document.getElementById('contracts-cards-grid');
  if (!grid) return;

  grid.innerHTML = `
    <div style="padding:40px;text-align:center;color:#999;font-size:.84rem;grid-column:1/-1;">
      <div style="width:24px;height:24px;border:2px solid #f0ece6;border-top-color:#E8761E;
           border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px;"></div>
      Loading your contracts…
    </div>`;

  try {
    const res = await fetch(API_BASE + '/api/contracts/my', { headers: HEADERS });

    if (res.status === 401) { handleUnauth(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    ALL_CONTRACTS = data.contracts || [];

    if (!ALL_CONTRACTS.length) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:52px 24px;
             border:1.5px dashed #e0e0e0;border-radius:14px;color:#888;font-size:.84rem;">
          <div style="font-size:2rem;margin-bottom:12px;">📄</div>
          <strong>No contracts yet</strong>
          <p style="margin-top:6px;">Subscribe to a product to see your contracts here.</p>
          <a href="Online_subscription.html"
             style="display:inline-block;margin-top:16px;padding:10px 22px;
                    background:#E8761E;color:#fff;border-radius:8px;font-weight:700;
                    text-decoration:none;">Browse Products →</a>
        </div>`;
      return;
    }

    grid.innerHTML = ALL_CONTRACTS.map(co => {
      const isActive  = co.status === 'active';
      const badgeCls  = isActive ? 'cfc-badge--active' : 'cfc-badge--expired';
      const badgeLbl  = co.status.charAt(0).toUpperCase() + co.status.slice(1);
      const iconCls   = isActive ? 'cfc-icon--blue' : 'cfc-icon--gray';
      const cardCls   = isActive ? '' : ' contract-full-card--expired';
      const icon      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           stroke-width="2" stroke-linecap="round">
                           <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                           <polyline points="14 2 14 8 20 8"/>
                         </svg>`;
      return `
        <div class="contract-full-card${cardCls}">
          <div class="cfc-header">
            <div class="cfc-icon ${iconCls}">${icon}</div>
            <div class="cfc-meta">
              <div class="cfc-type">${co.product_name || 'Insurance Contract'}</div>
              <div class="cfc-ref">${co.policy_reference || '#' + co.contract_id}</div>
            </div>
            <span class="cfc-badge ${badgeCls}">${badgeLbl}</span>
          </div>
          <div class="cfc-body">
            ${co.plan_name ? `<div class="cfc-row"><span class="cfc-label">Plan</span>
              <span class="cfc-value">${co.plan_name}</span></div>` : ''}
            <div class="cfc-row">
              <span class="cfc-label">Start date</span>
              <span class="cfc-value">${fmt(co.start_date)}</span>
            </div>
            <div class="cfc-row">
              <span class="cfc-label">End date</span>
              <span class="cfc-value">${fmt(co.end_date)}</span>
            </div>
            <div class="cfc-row">
              <span class="cfc-label">Premium</span>
              <span class="cfc-value">${fmtMoney(co.premium_amount)} / year</span>
            </div>
          </div>
          <div class="cfc-footer">
            ${isActive ? `
            <button class="cfc-btn-doc"
              onclick="openNewClaimModal(${co.contract_id}, '${co.policy_reference || '#' + co.contract_id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              File a Claim
            </button>` : ''}
            <button class="cfc-btn-sec"
              onclick="alert('Please contact your agency to renew this contract.')">Renew</button>
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    console.error('[Contracts] Load error:', err.message);
    grid.innerHTML = `
      <div style="grid-column:1/-1;padding:32px;text-align:center;
           color:#e53e3e;font-size:.82rem;">
        ⚠ Unable to load contracts. Please try again.
      </div>`;
  }
}

/* ============================================================
   CLAIM CREATION — CONTRACT-FIRST FLOW
   ─────────────────────────────────────────────────────────
   Flow:
     1. openNewClaimModal(contractId, ref)  — from contracts card
        OR openNewClaimModalGeneric()        — from "New Claim" button
     2. User fills form  (contract already pre-selected)
     3. submitNewClaim() → POST /api/claims with real contract_id
   ─────────────────────────────────────────────────────────
   What we NEVER do:
     ✗ hardcode contract_id
     ✗ guess a contract_id
     ✗ send client_id (backend resolves it from JWT)
============================================================ */

// Called from the "New Claim" button (no pre-selected contract)
window.openNewClaimModalGeneric = async function () {
  // Make sure we have contracts loaded first
  if (!ALL_CONTRACTS.length) {
    try {
      const res  = await fetch(API_BASE + '/api/contracts/my', { headers: HEADERS });
      const data = await res.json();
      ALL_CONTRACTS = data.contracts || [];
    } catch (_) {}
  }

  const active = ALL_CONTRACTS.filter(c => c.status === 'active');
  if (!active.length) {
    showToast('You have no active contracts. Please subscribe first.', 'error');
    return;
  }

  // If exactly one active contract, pre-select it
  if (active.length === 1) {
    openNewClaimModal(active[0].contract_id, active[0].policy_reference);
    return;
  }

  // Multiple active contracts — show selector first
  openNewClaimModal(null, null, active);
};

// Called from contracts card (contract already known)
window.openNewClaimModal = function (contractId, policyRef, contractList = null) {
  const modal = document.getElementById('newClaimModal');
  if (!modal) return;

  // Reset form
  document.getElementById('claimFormError').style.display = 'none';
  document.getElementById('claimFormError').textContent   = '';
  document.getElementById('ncContractSelect').value       = '';
  document.getElementById('ncDescription').value          = '';
  document.getElementById('ncClaimDate').value            = new Date().toISOString().slice(0, 10);
  document.getElementById('ncLocation').value             = '';

  // Populate contract selector
  const select       = document.getElementById('ncContractSelect');
  const contractsToShow = contractList
    || ALL_CONTRACTS.filter(c => c.status === 'active');

  select.innerHTML = '<option value="">— Select a contract —</option>'
    + contractsToShow.map(c =>
        `<option value="${c.contract_id}">
           ${c.policy_reference || '#' + c.contract_id}
           — ${c.product_name || 'Insurance'}
           (expires ${fmt(c.end_date)})
         </option>`
      ).join('');

  // Pre-select if we came from a specific card
  if (contractId) select.value = contractId;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Focus description
  setTimeout(() => document.getElementById('ncDescription').focus(), 100);
};

window.closeNewClaimModal = function () {
  const modal = document.getElementById('newClaimModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
};

window.submitNewClaim = async function () {
  const contractId   = document.getElementById('ncContractSelect').value;
  const description  = document.getElementById('ncDescription').value.trim();
  const claimDate    = document.getElementById('ncClaimDate').value;
  const location     = document.getElementById('ncLocation').value.trim();
  const errEl        = document.getElementById('claimFormError');
  const submitBtn    = document.getElementById('ncSubmitBtn');

  // ── Client-side validation ────────────────────────────────────────────────
  function showErr(msg) {
    errEl.textContent   = msg;
    errEl.style.display = 'block';
  }

  if (!contractId)             { showErr('Please select a contract.'); return; }
  if (description.length < 10) { showErr('Description must be at least 10 characters.'); return; }
  if (!claimDate)              { showErr('Please enter the incident date.'); return; }

  errEl.style.display = 'none';

  // ── Build payload — NEVER include client_id (backend resolves from JWT) ──
  const payload = {
    contract_id:       parseInt(contractId, 10),
    description,
    claim_date:        claimDate,
    incident_location: location || null,
    // incident_lat / incident_lng omitted (no map picker in this flow)
  };

  console.log('[CAAR] New Claim payload:', payload);

  submitBtn.disabled   = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const res  = await fetch(API_BASE + '/api/claims', {
      method:  'POST',
      headers: HEADERS,
      body:    JSON.stringify(payload),
    });

    const data = await res.json();
    console.log('[CAAR] New Claim response (HTTP ' + res.status + '):', data);

    if (res.status === 401) { handleUnauth(); return; }

    if (!res.ok) {
      showErr(data.error || 'Failed to submit claim (HTTP ' + res.status + ').');
      return;
    }

    // Success
    closeNewClaimModal();
    showToast('Claim #' + data.claim_id + ' submitted successfully!');
    // Refresh claims list (will be visible if user opens the section)
    ALL_CLAIMS = [];
    loadClaims();

  } catch (err) {
    console.error('[CAAR] Claim submit network error:', err);
    showErr('Network error — please check your connection.');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit Claim';
  }
};

/* ============================================================
   ROADSIDE FORM (local, no API changes needed)
============================================================ */
let selectedProblemType = '';

window.selectProblemChip = function (el, value) {
  document.querySelectorAll('.rf-problem-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedProblemType = value;
};

window.submitRoadsideRequest = function () {
  const plate   = document.getElementById('rfLicensePlate')?.value.trim();
  const wilaya  = document.getElementById('rfWilaya')?.value;
  const address = document.getElementById('rfAddress')?.value.trim();
  const desc    = document.getElementById('rfDescription')?.value.trim();
  const phone   = document.getElementById('rfPhone')?.value.trim();

  if (!selectedProblemType) { showToast('Please select the type of problem.', 'error'); return; }
  if (!plate)                { showToast('Please enter your license plate.',   'error'); return; }
  if (!wilaya)               { showToast('Please select your wilaya.',         'error'); return; }
  if (!address)              { showToast('Please enter your location.',        'error'); return; }
  if (!desc)                 { showToast('Please describe the problem.',       'error'); return; }
  if (!phone)                { showToast('Please enter your phone number.',    'error'); return; }

  const btn = document.getElementById('btnRoadsideSubmit');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  setTimeout(() => {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Assistance Request'; }
    const ref   = 'RSA-REQ-' + Date.now().toString(36).toUpperCase();
    const refEl = document.getElementById('rsRequestRef');
    if (refEl) refEl.textContent = ref;
    document.getElementById('roadsideFormBody').style.display = 'none';
    const success = document.getElementById('roadsideSuccess');
    if (success) { success.style.display = 'block'; success.classList.add('show'); }
  }, 1400);
};

window.resetRoadsideForm = function () {
  ['rfLicensePlate','rfBrand','rfAddress','rfDescription','rfPhone','rfCity']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  selectedProblemType = '';
  document.querySelectorAll('.rf-problem-chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('roadsideFormBody').style.display = '';
  const success = document.getElementById('roadsideSuccess');
  if (success) { success.style.display = 'none'; success.classList.remove('show'); }
};

/* ============================================================
   PROFILE
============================================================ */
window.saveProfile = function () {
  const first = document.getElementById('pf-first')?.value.trim();
  const last  = document.getElementById('pf-last')?.value.trim();
  if (!first || !last) { showToast('Name fields cannot be empty.', 'error'); return; }
  const ok = document.getElementById('pfb-success');
  if (ok) { ok.style.display = 'flex'; setTimeout(() => { ok.style.display = 'none'; }, 3000); }
  showToast('Profile saved (UI only — backend endpoint not wired).');
};

window.cancelProfile = function () {
  document.getElementById('pf-first').value = CURRENT_USER.first_name || '';
  document.getElementById('pf-last').value  = CURRENT_USER.last_name  || '';
  document.getElementById('pf-email').value = CURRENT_USER.email      || '';
  document.getElementById('pf-phone').value = CURRENT_USER.phone      || '';
};

window.changePassword = function () {
  const pw1  = document.getElementById('pf-pw-new').value;
  const pw2  = document.getElementById('pf-pw-confirm').value;
  const errEl = document.getElementById('pfb-pw-error');
  const okEl  = document.getElementById('pfb-pw-success');
  if (pw1 !== pw2) {
    if (errEl) errEl.style.display = 'flex';
    setTimeout(() => { if (errEl) errEl.style.display = 'none'; }, 3000);
    return;
  }
  if (okEl) { okEl.style.display = 'flex'; setTimeout(() => { okEl.style.display = 'none'; }, 3000); }
  showToast('Password updated (UI only — backend not wired).');
};

/* ============================================================
   HELPERS
============================================================ */
function handleUnauth() {
  localStorage.removeItem('token');
  localStorage.removeItem('caar_auth_token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    window.closeClaimPanel?.();
    window.closeNewClaimModal?.();
  }
});

/* ============================================================
   INIT
============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  renderUserIdentity();
  loadDashboardStats();
  // Claims and Contracts load lazily when the section is opened
});