// ===== RECHERCHE =====
const searchBtn   = document.getElementById('searchBtn');
const searchBar   = document.getElementById('searchBar');
const searchClose = document.getElementById('searchClose');

searchBtn.addEventListener('click', () => {
  searchBar.classList.toggle('open');
  if (searchBar.classList.contains('open')) {
    searchBar.querySelector('.search-input').focus();
  }
});

searchClose.addEventListener('click', () => {
  searchBar.classList.remove('open');
});

// Fermer la barre avec Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') searchBar.classList.remove('open');
});


// ===== CHANGEMENT DE LANGUE =====
const currentLang = document.getElementById('currentLang');
const langLinks   = document.querySelectorAll('[data-lang]');

langLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const lang = link.getAttribute('data-lang');
    currentLang.textContent = lang;

    // Direction RTL pour l'arabe
    if (lang === 'ARAB') {
      document.documentElement.setAttribute('dir', 'rtl');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
    }
  });
});


// ===== LIEN ACTIF sur clic =====
const navLinks = document.querySelectorAll('.nav-link:not(.dropdown-toggle)');
navLinks.forEach(link => {
  link.addEventListener('click', () => {
    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
  });
});