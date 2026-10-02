(() => {
  const root = document.documentElement;
  root.classList.remove('no-js');

  // Announcement bar: remember dismissal for this browser
  const announce = document.getElementById('announce');
  const ANNOUNCE_KEY = 'announce-dismissed';
  try {
    if (localStorage.getItem(ANNOUNCE_KEY) === '1') announce?.classList.add('is-hidden');
  } catch { /* storage blocked, keep bar visible */ }
  document.querySelector('[data-dismiss="announce"]')?.addEventListener('click', () => {
    announce.classList.add('is-hidden');
    try { localStorage.setItem(ANNOUNCE_KEY, '1'); } catch { /* ignore */ }
  });

  // Sticky nav shadow
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  const toggle = document.querySelector('.nav__toggle');
  const links = document.getElementById('nav-links');
  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    links.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // Reveal on scroll
  const revealEls = document.querySelectorAll('.reveal, .feature__visual');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
