/* Загрузка контента: запускается в <head>, до стилей, шрифтов и просмотрщика.
   Резервные переводы нужны даже тогда, когда сам site.md недоступен. */
(() => {
  'use strict';
  const defaults = {
    'Загрузка': { ru: 'Загружаем контент…', en: 'Loading content…' },
    'Ошибка': { ru: 'Не удалось загрузить контент. Попробуйте обновить страницу.', en: 'Could not load content. Please reload the page.' },
    'Обновить': { ru: 'Обновить страницу', en: 'Reload page' }
  };
  let labels = { ...defaults };
  // Локально контент читается всегда заново (правки видны сразу), на сайте — из кэша
  // с проверкой свежести: GitHub Pages отдаёт файл повторно только после max-age.
  const localPreview = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  const cachePolicy = localPreview ? 'no-store' : 'default';
  async function fetchMarkdown(address) {
    // Один повтор при временном сетевом сбое; таймаут действует и на тело ответа.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(address, { cache: cachePolicy, priority: 'high', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.text();
      } catch (error) { if (attempt) throw error; }
    }
  }
  const firstRequest = location.protocol === 'file:' ? null : fetchMarkdown(new URL('site.md', document.baseURI))
    .then(source => ({ source }), error => ({ error }));
  let firstConsumed = false;
  function label(node, key) {
    node.dataset.contentLabel = key;
    const value = labels[key] || defaults[key];
    node.textContent = value[document.documentElement.lang === 'en' ? 'en' : 'ru'];
  }
  function updateLabels() {
    document.querySelectorAll('[data-content-label]').forEach(node => label(node, node.dataset.contentLabel));
  }
  function panel(container, failed = false) {
    const box = document.createElement('div'); box.className = 'content-state'; box.dataset.contentState = failed ? 'error' : 'loading'; box.setAttribute('role', 'status');
    const message = document.createElement('p'); label(message, failed ? 'Ошибка' : 'Загрузка'); box.append(message);
    if (failed) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'btn btn--secondary btn--neutral btn--outline btn--l';
      label(button, 'Обновить'); button.addEventListener('click', () => location.reload()); box.append(button);
    }
    container.replaceChildren(box); container.setAttribute('aria-busy', String(!failed));
  }
  const blocks = ['#heroLoading', '.works-list', '#gallery > .gallery-grid', '#aboutContent', '.publications-grid', '.contact-links'];
  function caseSkeleton(container) {
    const box = document.createElement('div');
    box.className = 'case-skeleton article-media';
    box.setAttribute('role', 'status');
    const message = document.createElement('span');
    message.className = 'case-skeleton__status';
    label(message, 'Загрузка');
    box.append(message);
    const shapes = document.createElement('div');
    shapes.setAttribute('aria-hidden', 'true');
    shapes.innerHTML = `
      <div class="case-skeleton__copy">
        <div class="case-skeleton__shape case-skeleton__title"></div>
      </div>
      <div class="case-skeleton__shape case-skeleton__media"></div>
      <div class="case-skeleton__copy">
        <div class="case-skeleton__shape case-skeleton__line"></div>
        <div class="case-skeleton__shape case-skeleton__line"></div>
        <div class="case-skeleton__shape case-skeleton__line case-skeleton__line--short"></div>
      </div>`;
    box.append(shapes);
    container.replaceChildren(box);
    container.setAttribute('aria-busy', 'true');
  }
  const texts = new Map();
  window.ContentState = {
    async read(address) {
      if (!firstConsumed && firstRequest && new URL(address).pathname === new URL('site.md', document.baseURI).pathname) {
        firstConsumed = true;
        const key = String(address);
        const result = await firstRequest;
        if (!result.error) {
          texts.set(key, Promise.resolve(result.source));
          return result.source;
        }
        throw result.error;
      }
      // Один запрос на файл: предзагрузка при наведении и открытие окна
      // используют уже полученный текст, а не качают статью дважды.
      // Ключ приводим к строке: адрес приходит и как URL, и как строкой.
      const key = String(address);
      if (texts.has(key)) return texts.get(key);
      const request = fetchMarkdown(address);
      texts.set(key, request);
      try { return await request; } catch (error) { texts.delete(key); throw error; }
    },
    configure(values) { labels = { ...defaults, ...values }; updateLabels(); },
    panel,
    caseSkeleton,
    failEmptyBlocks() {
      blocks.forEach(selector => {
        const node = document.querySelector(selector);
        if (!node.dataset.contentLoaded && (!node.children.length || node.querySelector(':scope > .content-state'))) panel(node, true);
      });
    }
  };
  document.addEventListener('languagechange', updateLabels);
  document.addEventListener('DOMContentLoaded', () => {
    blocks.forEach(selector => {
      const node = document.querySelector(selector);
      if (!node.dataset.contentLoaded && !node.children.length) panel(node);
    });
    // Если основной скрипт не выполнился, пустые блоки не останутся вечной загрузкой.
    setTimeout(() => window.ContentState.failEmptyBlocks(), 22000);
    const watched = new WeakMap();
    const nearScreen = new IntersectionObserver(entries => entries.forEach(entry => {
      const media = entry.target, state = watched.get(media);
      if (!state || !media.isConnected) return;
      state.near = entry.isIntersecting;
      if (media.matches('video[data-site-preview]')) {
        if (state.near) {
          if (media.dataset.previewSrc) {
            media.src = media.dataset.previewSrc; delete media.dataset.previewSrc;
          }
          if (!document.hidden && !document.querySelector('.fancybox__container')) media.play().catch(() => {});
        } else media.pause();
      }
      if (state.near && state.slot.dataset.mediaState === 'loading') state.startTimer();
    }), { rootMargin: '300px' });
    function watch(media) {
      // Fancybox сам управляет загрузкой/ошибками и геометрией своих медиа.
      if (watched.has(media) || media.closest('.logo, .fancybox__container')) return;
      // У обложек используем существующую рамку, чтобы не менять размеры и hover.
      let slot = media.parentElement;
      if (!slot.matches('.avatar, .work-item__frame, .gallery-item > a, .publication-image')) {
        slot = document.createElement('span'); slot.className = 'media-slot';
        media.replaceWith(slot); slot.append(media);
      }
      slot.classList.add('media-state');
      slot.querySelectorAll(':scope > .media-state__message').forEach(node => node.remove());
      const message = document.createElement('span'); message.className = 'media-state__message';
      message.setAttribute('role', 'status'); slot.append(message);
      let timer;
      const state = { slot, near: false, startTimer() {
        if (!timer && media.getAttribute('src') && (media.tagName === 'IMG' || media.autoplay || !media.paused)) {
          timer = setTimeout(() => set('error'), 30000);
        }
      } };
      watched.set(media, state);
      function ratio() {
        if (!media.isConnected || media.parentElement !== slot) return;
        const width = media.naturalWidth || media.videoWidth || Number(media.getAttribute('width'));
        const height = media.naturalHeight || media.videoHeight || Number(media.getAttribute('height'));
        if (width && height) slot.style.setProperty('--media-ratio', `${width} / ${height}`);
      }
      function set(value) {
        // События старого файла после смены обложки не меняют состояние новой.
        if (!media.isConnected || media.parentElement !== slot) return;
        clearTimeout(timer); timer = null;
        ratio(); slot.dataset.mediaState = value;
        // Загрузку показывает skeleton; текст нужен только при ошибке медиа.
        message.hidden = value !== 'error';
        slot.setAttribute('aria-busy', String(value === 'loading'));
        if (value === 'error') label(message, 'Ошибка');
      }
      function reset() { set('loading'); if (state.near) state.startTimer(); }
      state.reset = reset;
      state.dispose = () => { clearTimeout(timer); state.near = false; message.remove(); }; 
      media.addEventListener('error', () => set('error'));
      media.querySelectorAll('source').forEach(source => source.addEventListener('error', () => set('error')));
      media.addEventListener('load', () => set('ready'));
      media.addEventListener('loadeddata', () => set('ready'));
      media.addEventListener('loadedmetadata', () => {
        ratio();
        // Плеер статьи/«О себе» с preload=metadata уже доступен для запуска.
        if (!media.matches('[data-site-preview]')) set('ready');
      });
      media.addEventListener('emptied', reset);
      media.addEventListener('loadstart', () => { if (state.near) state.startTimer(); });
      media.addEventListener('playing', () => set('ready'));
      reset();
      if (media.tagName === 'IMG' && media.complete && media.currentSrc) set(media.naturalWidth ? 'ready' : 'error');
      if (media.tagName === 'VIDEO' && media.error) set('error');
      else if (media.readyState >= (media.matches('[data-site-preview]') ? 2 : 1)) set('ready');
      nearScreen.observe(media);
    }
    function scan(node) {
      if (node.nodeType !== 1) return;
      if (node.matches('img, video')) watch(node);
      node.querySelectorAll('img, video').forEach(watch);
    }
    scan(document.body);
    new MutationObserver(records => records.forEach(record => {
      if (record.type === 'attributes') watched.get(record.target)?.reset();
      else {
        record.addedNodes.forEach(scan);
        record.removedNodes.forEach(node => {
          if (node.nodeType !== 1 || node.isConnected) return;
          [node, ...node.querySelectorAll('img, video')].forEach(media => {
            nearScreen.unobserve(media);
            // Не держим таймеры удалённых карточек после обновления Markdown.
            const state = watched.get(media); if (state) state.dispose();
          });
        });
      }
    })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  });
})();
