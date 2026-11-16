/* Однократное появление при загрузке страницы, после первого чтения site.md.
   Скролл, смена языка и фоновые обновления CMS не запускают его повторно. */
(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) return;
  root.classList.add('page-enter-pending');
  let started = false;
  let contentReady = false;
  let fallback;

  function start() {
    if (started || document.readyState === 'loading') return;
    started = true;
    clearTimeout(fallback);
    try {
      if (reducedMotion.matches) return;
      // Только элементы текущего экрана: длинные невидимые секции не размываем.
      // При обновлении в середине страницы появляется именно текущий раздел.
      const selector = [
        'main > section > .section-label', 'main > section > .section-hint',
        '#hero > .hero-image', '#heroDescription', '#hero > .hero-status',
        '#hero .hero-actions > *', '.work-item', '.archive-header', '.archive-card',
        '.gallery-item', '#aboutPhoto', '#aboutDescription', '.about-panel',
        '.publication-card', '.contact-links > a', '#footer > *'
      ].join(',');
      // На телефонах появляется вся плавающая шапка. На остальных экранах —
      // отдельные видимые элементы; не фильтруем родителя fixed-навигации.
      const navigation = matchMedia('(max-width: 767px)').matches
        ? '.site-header'
        : '.site-header .logo, .menu-toggle, #primaryNavigation a, #themeBtn, .lang-btn, #headerActions > a';
      const reveal = selection => {
      let step = 0;
      document.querySelectorAll(selection).forEach(node => {
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight ||
            node.closest('[hidden]') || node.parentElement.closest('.page-enter-item')) return;
        node.style.setProperty('--page-enter-index', Math.min(step++, 6));
        node.classList.add('page-enter-item');
        const clear = event => {
          if (event.target !== node || event.animationName !== 'page-enter') return;
          node.classList.remove('page-enter-item');
          node.style.removeProperty('--page-enter-index');
          node.removeEventListener('animationend', clear);
          node.removeEventListener('animationcancel', clear);
        };
        node.addEventListener('animationend', clear);
        node.addEventListener('animationcancel', clear);
      });
      };
      // Независимые очереди: навигация не задерживает появление контента.
      reveal(navigation);
      reveal(selector);
    } finally {
      root.classList.remove('page-enter-pending');
    }
  }

  document.addEventListener('site-content-ready', () => {
    contentReady = true;
    start();
  }, { once: true });
  document.addEventListener('DOMContentLoaded', () => {
    if (contentReady) start();
    // При медленном Markdown или ошибке CMS не держим страницу невидимой.
    else fallback = setTimeout(start, 1500);
  }, { once: true });
  reducedMotion.addEventListener('change', event => {
    if (event.matches) start();
  });
})();
