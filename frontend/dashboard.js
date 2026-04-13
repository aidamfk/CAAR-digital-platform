/* ============================================================
   CAAR — Client Dashboard JS
   Connects to real API. Replaces all mock data.
============================================================ */

const API_BASE = 'http://localhost:3000';

/* ── 1. AUTH GUARD ─────────────────────────────────────── */
const token = localStorage.getItem('caar_auth_token') 
           || localStorage.getItem('user') && JSON.parse(localStorage.getItem('user'))?.token;

// Try to get token from the user object stored by login.html
function getToken() {
  // Direct token storage (from roads.html flow)
  const direct = localStorage.getItem('caar_auth_token');
  if (direct) return direct;
  // Fallback: token may be inside stored user object
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.token || null;
  } catch { return null; }
}

// Use auth.js as source of truth
const AUTH_TOKEN = localStorage.getItem('token') 
               || localStorage.getItem('caar_auth_token') 
               || null;

if (!AUTH_TOKEN) {
  window.location.href = 'login.html';
}

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + AUTH_TOKEN
};
/* ── 2. LOADING HELPERS ─────────────────────────────────── */
function showLoading(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.innerHTML = `
    <div style="padding:40px;text-align:center;color:#999;font-size:0.85rem;">
      <div style="width:28px;height:28px;border:3px solid #f0ece6;border-top-color:#E8761E;
           border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
      Loading…
    </div>`;
}

function showError(sectionId, msg) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.innerHTML = `
    <div style="padding:32px;text-align:center;color:#e53e3e;font-size:0.82rem;">
      ⚠ ${msg || 'Unable to load data. Please try again.'}
    </div>`;
}

/* ── 3. SPA NAVIGATION ──────────────────────────────────── */
const SECTION_CONFIG = {
  dashboard: { title: 'Dashboard',        icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' },
  claims:    { title: 'My Claims',         icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  roadside:  { title: 'Request Roadside',  icon: '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>' },
  messages:  { title: 'Messages',          icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
  contracts: { title: 'My Contracts',      icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' },
  profile:   { title: 'Profile',           icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' }
};

window.switchSection = function(key, clickedEl) {
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
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + cfg.icon + '</svg>';

  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Load section data on demand
  if (key === 'claims') loadClaims();
};

/* ── 4. MOBILE SIDEBAR ──────────────────────────────────── */
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

/* ── 5. DASHBOARD STATS ─────────────────────────────────── */
async function loadDashboardStats() {
  try {
    const res  = await fetch(API_BASE + '/api/dashboard/stats', { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    // Total Claims
    const totalEl = document.querySelector('.summary-card--orange .sc-value');
    if (totalEl) totalEl.textContent = data.total_claims ?? '—';

    // Active Claims (pending claims — backend gives total, we approximate)
    // If your backend doesn't return active separately, show same or 0
    const activeEl = document.querySelector('.summary-card--amber .sc-value');
    if (activeEl) activeEl.textContent = data.total_claims ?? '—';

    // Contracts
    const contractEl = document.querySelector('.summary-card--blue .sc-value');
    if (contractEl) contractEl.textContent = data.total_contracts ?? '—';

    // Pending requests (payments pending)
    const pendingEl = document.querySelector('.summary-card--green .sc-value');
    if (pendingEl) pendingEl.textContent = data.total_payments ?? '—';

  } catch (err) {
    console.error('[Dashboard] Stats error:', err.message);
    // Don't crash the whole page — just leave cards as-is
  }
}

/* ── 6. CLAIMS ──────────────────────────────────────────── */
const STATUS_CONFIG = {
  pending:         { cls: 'status-badge--pending',         label: 'Pending' },
  under_review:    { cls: 'status-badge--under-review',    label: 'Under Review' },
  expert_assigned: { cls: 'status-badge--expert-assigned', label: 'Expert Assigned' },
  reported:        { cls: 'status-badge--approved',        label: 'Reported' },
  closed:          { cls: 'status-badge--approved',        label: 'Closed' },
  rejected:        { cls: 'status-badge--rejected',        label: 'Rejected' }
};

let ALL_CLAIMS = [];

async function loadClaims() {
  const tbody    = document.getElementById('claimsTableBody');
  const emptyEl  = document.getElementById('claimsEmpty');
  const countEl  = document.getElementById('claimsCountNum');

  if (!tbody) return;

  // Show loading state
  tbody.innerHTML = `
    <tr><td colspan="5" style="text-align:center;padding:32px;color:#999;font-size:0.82rem;">
      <div style="width:22px;height:22px;border:2px solid #f0ece6;border-top-color:#E8761E;
           border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 10px;"></div>
      Loading claims…
    </td></tr>`;

  try {
    const res = await fetch(API_BASE + '/api/claims', { headers: HEADERS });

    if (res.status === 401) {
      localStorage.removeItem('caar_auth_token');
      window.location.href = 'login.html';
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    ALL_CLAIMS = data.claims || [];

    renderClaimsTable(ALL_CLAIMS);

  } catch (err) {
    console.error('[Claims] Load error:', err.message);
    tbody.innerHTML = `
      <tr><td colspan="5" style="text-align:center;padding:32px;color:#e53e3e;font-size:0.82rem;">
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
    const sc = STATUS_CONFIG[c.status] || { cls: 'status-badge--pending', label: c.status };
    const date = c.claim_date
      ? new Date(c.claim_date).toLocaleDateString('en-GB')
      : '—';

    return `<tr>
      <td><span class="claim-id-cell">#${c.claim_id}</span></td>
      <td>${date}</td>
      <td><span class="type-chip">${c.contract_id ? 'Contract #' + c.contract_id : '—'}</span></td>
      <td><span class="status-badge ${sc.cls}">${sc.label}</span></td>
      <td>
        <button class="btn-claim-view" onclick="openClaimPanel(${c.claim_id})">
          <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          View
        </button>
      </td>
    </tr>`;
  }).join('');
}

window.filterClaims = function(status) {
  const filtered = status === 'all'
    ? ALL_CLAIMS
    : ALL_CLAIMS.filter(c => c.status === status);
  renderClaimsTable(filtered);
};

/* ── 7. CLAIM DETAIL PANEL ──────────────────────────────── */
window.openClaimPanel = function(claimId) {
  const claim = ALL_CLAIMS.find(c => c.claim_id === claimId || c.claim_id === String(claimId));
  if (!claim) return;

  document.getElementById('cdpTitle').textContent    = '#' + claim.claim_id;
  document.getElementById('cdpSubtitle').textContent = 'Status: ' + (STATUS_CONFIG[claim.status]?.label || claim.status);

  const date = claim.claim_date
    ? new Date(claim.claim_date).toLocaleDateString('en-GB') : '—';

  document.getElementById('cdpBody').innerHTML = `
    <div class="cdp-section">
      <div class="cdp-section-title">Claim Info</div>
      <div class="cdp-info-grid">
        <div class="cdp-info-item">
          <div class="cdp-info-label">Status</div>
          <div class="cdp-info-value">
            <span class="status-badge ${STATUS_CONFIG[claim.status]?.cls || ''}">
              ${STATUS_CONFIG[claim.status]?.label || claim.status}
            </span>
          </div>
        </div>
        <div class="cdp-info-item">
          <div class="cdp-info-label">Date Filed</div>
          <div class="cdp-info-value">${date}</div>
        </div>
        <div class="cdp-info-item">
          <div class="cdp-info-label">Contract</div>
          <div class="cdp-info-value">#${claim.contract_id}</div>
        </div>
        <div class="cdp-info-item">
          <div class="cdp-info-label">Client</div>
          <div class="cdp-info-value">${claim.client_name || '—'}</div>
        </div>
      </div>
    </div>
    <div class="cdp-section">
      <div class="cdp-section-title">Description</div>
      <div class="cdp-description">${claim.description || 'No description provided.'}</div>
    </div>`;

  document.getElementById('claimPanelOverlay').classList.add('open');
  document.getElementById('claimDetailPanel').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeClaimPanel = function() {
  document.getElementById('claimPanelOverlay').classList.remove('open');
  document.getElementById('claimDetailPanel').classList.remove('open');
  document.body.style.overflow = '';
};

/* ── 8. ROADSIDE FORM (kept as-is, no API needed) ──────── */
let selectedProblemType = '';

window.selectProblemChip = function(el, value) {
  document.querySelectorAll('.rf-problem-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedProblemType = value;
};

window.submitRoadsideRequest = function() {
  const plate   = document.getElementById('rfLicensePlate')?.value.trim();
  const wilaya  = document.getElementById('rfWilaya')?.value;
  const address = document.getElementById('rfAddress')?.value.trim();
  const desc    = document.getElementById('rfDescription')?.value.trim();
  const phone   = document.getElementById('rfPhone')?.value.trim();

  if (!selectedProblemType) { alert('Please select the type of problem.'); return; }
  if (!plate)                { alert('Please enter your license plate.'); return; }
  if (!wilaya)               { alert('Please select your wilaya.'); return; }
  if (!address)              { alert('Please enter your location.'); return; }
  if (!desc)                 { alert('Please describe the problem.'); return; }
  if (!phone)                { alert('Please enter your phone number.'); return; }

  const btn = document.getElementById('btnRoadsideSubmit');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  setTimeout(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Assistance Request'; }
    const ref = 'RSA-REQ-' + Date.now().toString(36).toUpperCase();
    const refEl = document.getElementById('rsRequestRef');
    if (refEl) refEl.textContent = ref;
    document.getElementById('roadsideFormBody').style.display = 'none';
    const success = document.getElementById('roadsideSuccess');
    if (success) { success.style.display = 'block'; success.classList.add('show'); }
  }, 1400);
};

window.resetRoadsideForm = function() {
  ['rfLicensePlate','rfBrand','rfAddress','rfDescription','rfPhone','rfCity']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  selectedProblemType = '';
  document.querySelectorAll('.rf-problem-chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('roadsideFormBody').style.display = '';
  const success = document.getElementById('roadsideSuccess');
  if (success) { success.style.display = 'none'; success.classList.remove('show'); }
};

/* ── 9. ESC KEY ─────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.closeClaimPanel?.();
});

/* ── 10. INIT ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  loadDashboardStats();
  // Claims load on demand when section is clicked
});