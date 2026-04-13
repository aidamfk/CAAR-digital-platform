/* ============================================================
   CAAR — auth.js
   Single source of truth for all authentication logic.
   Import this on every page that needs auth awareness.
============================================================ */

const AUTH_API = 'http://localhost:3000';

/* ── Getters ─────────────────────────────────────────────── */
function getToken() {
  return localStorage.getItem('token') || null;
}
function getRole() {
  return localStorage.getItem('role') || null;
}
function isLoggedIn() {
  return !!getToken();
}

/* ── Role → dashboard URL ────────────────────────────────── */
function getDashboardUrl(role) {
  const map = {
    client: 'client-dashboard.html',
    admin:  'admin-dashboard.html',
    expert: 'expert-dashboard.html'
  };
  return map[role] || 'client-dashboard.html';
}

/* ── Redirect to correct dashboard ──────────────────────── */
function redirectToDashboard() {
  window.location.href = getDashboardUrl(getRole());
}

/* ── Auth guard — call at top of any protected page ─────── */
function requireAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
  }
}

/* ── Logout ──────────────────────────────────────────────── */
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('user');
  localStorage.removeItem('caar_auth_token'); // clean up old key too
  window.location.href = 'index.html';
}

/* ── Dynamic header rendering ────────────────────────────── */
function renderAuthHeader() {
  const loginBtn     = document.getElementById('loginBtn');
  const userMenu     = document.getElementById('userMenu');
  const userAvatar   = document.getElementById('userAvatar');
  const userName     = document.getElementById('userName');
  const dropUserName = document.getElementById('dropUserName');
  const dropUserRole = document.getElementById('dropUserRole');
  const dashLink     = document.getElementById('dashboardLink');
  const logoutBtn    = document.getElementById('logoutBtn');

  if (!isLoggedIn()) {
    if (loginBtn)  loginBtn.style.display  = 'inline-block';
    if (userMenu)  userMenu.style.display  = 'none';
    return;
  }

  // Logged in — build from stored data
  const role = getRole();
  let   name = 'User';

  try {
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    name = stored.first_name
      ? stored.first_name + ' ' + (stored.last_name || '')
      : stored.name || stored.email || 'User';
  } catch { /* ignore */ }

  if (loginBtn)  loginBtn.style.display = 'none';
  if (userMenu)  userMenu.style.display = 'block';

  const initials = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  if (userAvatar)   userAvatar.textContent   = initials;
  if (userName)     userName.textContent     = name.split(' ')[0];
  if (dropUserName) dropUserName.textContent = name.trim();
  if (dropUserRole) dropUserRole.textContent = role || 'client';

  if (dashLink) {
    dashLink.href = getDashboardUrl(role);
    dashLink.addEventListener('click', function(e) {
      e.preventDefault();
      redirectToDashboard();
    });
  }
  if (logoutBtn) {
    // Remove old listeners by cloning
    const fresh = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(fresh, logoutBtn);
    fresh.addEventListener('click', logout);
  }
}

/* ── Toggle dropdown (used by userTrigger button) ────────── */
function initUserMenuToggle() {
  const trigger  = document.getElementById('userTrigger');
  const userMenu = document.getElementById('userMenu');
  if (!trigger || !userMenu) return;

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    userMenu.classList.toggle('open');
  });
  document.addEventListener('click', function() {
    userMenu.classList.remove('open');
  });
}