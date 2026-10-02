// Marketing site interactions: sticky header state, mobile menu, footer year.
(function () {
  'use strict';

  const nav = document.querySelector('.nav');
  const onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toggle = document.querySelector('.nav__toggle');
  const links = document.getElementById('nav-links');
  const setMenu = function (open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    links.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
  links.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
