/* Единый контент главной — site.md. Статьи — самостоятельные MD-файлы.
   Marked разбирает таблицы и Markdown. В описаниях из HTML разрешён только перенос <br>, URL проверяются.
   Здесь только механика; редактировать тексты и ссылки нужно в site.md. */
(function () {
  'use strict';
  const base = new URL('./', document.baseURI);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const status = document.querySelector('.works-status');
  const dialog = document.getElementById('caseDialog');
  const body = dialog.querySelector('.case-modal__body');
  const sheetBackdrop = document.createElement('div');
  sheetBackdrop.className = 'case-sheet-backdrop';
  sheetBackdrop.hidden = true;
  sheetBackdrop.setAttribute('aria-hidden', 'true');
  dialog.before(sheetBackdrop);
  const sheetQuery = window.matchMedia('(max-width: 767px)');
  let sheetScroll = null;
  const sheetBackground = [document.querySelector('header'), document.querySelector('main')];
  const previousInert = new Map();
  function syncCaseSheet() {
    const active = dialog.open && sheetQuery.matches;
    syncSheetGestureListeners(active);
    sheetBackdrop.hidden = !active;
    dialog.setAttribute('aria-modal', String(active));
    if (active && sheetScroll === null) {
      sheetScroll = window.scrollY;
      document.body.style.setProperty('--case-page-offset', `${-sheetScroll}px`);
      sheetBackground.forEach(node => { previousInert.set(node, node.inert); node.inert = true; });
      document.documentElement.classList.add('case-sheet-open');
      document.body.classList.add('case-sheet-open');
    } else if (!active && sheetScroll !== null) {
      document.documentElement.classList.remove('case-sheet-open');
      document.body.classList.remove('case-sheet-open');
      document.body.style.removeProperty('--case-page-offset');
      sheetBackground.forEach(node => { node.inert = previousInert.get(node); });
      window.scrollTo({ top: sheetScroll, behavior: 'instant' });
      sheetScroll = null;
    }
  }
  sheetQuery.addEventListener('change', syncCaseSheet);

  // Закрытие мобильного bottom sheet: панель уезжает вниз, подложка гаснет,
  // и только после анимации диалог закрывается. На планшете и десктопе
  // окно закрывается сразу — там выезда нет.
  let caseClosing = false;
  function closeCaseDialog() {
    if (!dialog.open || caseClosing) return;
    if (!sheetQuery.matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close();
      return;
    }
    caseClosing = true;
    dialog.classList.add('is-closing');
    sheetBackdrop.classList.add('is-closing');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      dialog.removeEventListener('animationend', onEnd);
      dialog.classList.remove('is-closing');
      sheetBackdrop.classList.remove('is-closing');
      caseClosing = false;
      dialog.close();
    };
    const onEnd = event => { if (event.target === dialog) finish(); };
    dialog.addEventListener('animationend', onEnd);
    // Страховка: если анимация не запустилась (фон-вкладка, сбой), закрываем сами.
    const timer = setTimeout(finish, 700);
  }
  const content = document.getElementById('caseContent');
  const renderer = new marked.Renderer();
  // Явный перенос в ячейке site.md: <br>, <br/> или <br />. Атрибуты и прочий HTML запрещены.
  renderer.html = token => /^<br\s*\/?\s*>$/i.test((typeof token === 'string' ? token : token.text).trim()) ? '<br>' : '';
  let signature = '', busy = false, article = null, articleRequest = 0;
  let trigger = null;
  const applied = new Map();
  const mobileCaseMedia = window.matchMedia('(max-width: 767px)');
  // Кадр карточки → его медиа: на телефоне может быть своя версия файла.
  const figureMedia = new WeakMap();

  function sections(markdown) {
    const result = {}; let heading = '';
    for (const token of marked.lexer(markdown, { gfm: true })) {
      if (token.type === 'heading' && [2, 3].includes(token.depth)) {
        heading = token.text.trim();
        if (result[heading]) throw new Error('Повторяется раздел: ' + heading);
        result[heading] = [];
      } else if (heading) result[heading].push(token);
    }
    return result;
  }
  function rows(section, name, index = 0) {
    const table = (section[name] || []).filter(token => token.type === 'table')[index];
    if (!table) throw new Error('Проверьте таблицу в разделе «' + name + '»');
    return table.rows.map(row => row.map(cell => cell.text.trim())).filter(row => row.some(Boolean));
  }
  // «Галерея» кейса — необязательная таблица с шапкой: дополнительные кадры
  // сторителлинга. Строки без медиа пропускаются, подписи необязательны.
  function caseGallery(table) {
    // У таблицы marked шапка лежит отдельно от строк.
    if (!table) return [];
    const titles = (table.header || []).map(cell => cell.text.trim());
    return table.rows.map(row => {
      const cell = key => (row[titles.indexOf(key)]?.text || '').trim();
      const media = cell('Медиа');
      if (!media) return null;
      const mobile = cell('Медиа для мобильных');
      return {
        source: url(media, base, true), type: mediaType(media, cell('Тип') || 'auto'),
        width: cell('Ширина') ? imageWidth(cell('Ширина')) : null,
        caption: pair(cell('Подпись RU'), cell('Подпись EN')),
        // Своя версия кадра для телефона: другой файл, свои пропорции.
        mobile: mobile ? { source: url(mobile, base, true),
          type: mediaType(mobile, cell('Тип для мобильных') || 'auto') } : null
      };
    }).filter(Boolean);
  }
  const pair = (ru = '', en = '') => ({ ru, en: en || ru });
  const language = () => document.documentElement.lang === 'en' ? 'en' : 'ru';
  function fields(section, name, required) {
    const data = Object.fromEntries(rows(section, name).map(([key, ru, en]) => [key, pair(ru, en)]));
    required.forEach(key => { if (!data[key]) throw new Error('Нет поля «' + key + '» в ' + name); });
    return data;
  }
  function url(value, origin = base, media = false) {
    if (!value) throw new Error('Не заполнен URL');
    const resolved = new URL(value, origin);
    const protocols = media ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:', 'tel:'];
    if (!protocols.includes(resolved.protocol)) throw new Error('Недопустимый URL: ' + value);
    return resolved.href;
  }
  const isMarkdown = href => /\.md$/i.test(new URL(href, base).pathname);
  const prefetched = new Set();
  // Подогрев статьи до клика: запрос уходит сразу, ответ ложится в кэш браузера.
  function prefetchCase(anchor) {
    if (!anchor.hasAttribute('data-open-case')) return;
    const address = anchor.href;
    if (prefetched.has(address)) return;
    prefetched.add(address);
    ContentState.read(address).catch(() => prefetched.delete(address));
  }
  function configureLink(anchor, href) {
    if (typeof href === 'object') {
      anchor.dataset.hrefRu = href.ru; anchor.dataset.hrefEn = href.en;
      href = href[language()];
    }
    // При смене языка ссылка может менять тип: MD, внешний сайт, PDF или якорь.
    delete anchor.dataset.openCase;
    ['aria-haspopup', 'aria-controls', 'target', 'rel'].forEach(name => anchor.removeAttribute(name));
    anchor.href = href;
    if (!anchor.classList.contains('btn') && !anchor.classList.contains('link')) {
      anchor.classList.add('link', 'link--inline');
    }
    if (isMarkdown(href)) {
      anchor.dataset.openCase = '';
      anchor.setAttribute('aria-haspopup', 'dialog');
      anchor.setAttribute('aria-controls', 'caseDialog');
      // Заранее подтягиваем статью при наведении или фокусе: окно кейса
      // открывается без ожидания сети. Повторный запрос отдаёт кэш браузера.
      if (!anchor.hasAttribute('data-prefetch')) {
        anchor.dataset.prefetch = '';
        anchor.addEventListener('pointerenter', () => prefetchCase(anchor), { passive: true });
        anchor.addEventListener('focus', () => prefetchCase(anchor));
      }
    } else if (/^https?:/.test(href) && new URL(href).origin !== base.origin) {
      anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    }
    if (anchor.id === 'cvCTA' || anchor.id === 'headerCvCTA') {
      const address = new URL(href);
      anchor.toggleAttribute('download', !isMarkdown(href) && address.origin === base.origin && !address.hash);
    }
    return anchor;
  }
  function translated(node, value, aria = false) {
    const ru = value.ru, en = value.en || ru;
    if (aria) {
      node.dataset.ariaRu = ru; node.dataset.ariaEn = en;
      node.setAttribute('aria-label', language() === 'en' ? en : ru);
    } else {
      node.dataset.ru = ru; node.dataset.en = en;
      node.textContent = language() === 'en' ? en : ru;
    }
    return node;
  }
  function element(tag, className = '', value) {
    const node = document.createElement(tag); node.className = className;
    if (value) translated(node, value);
    return node;
  }
  function link(href, label, className = '') {
    return configureLink(element('a', className, label), href);
  }
  // Разрешённые элементы Markdown, без стилей, событий, iframe и SVG из контента.
  function markdownFragment(markdown, origin = base, inline = false) {
    const html = inline ? marked.parseInline(markdown, { renderer }) : marked.parse(markdown);
    const documentCopy = new DOMParser().parseFromString(html, 'text/html');
    const allowed = new Set('P BR HR STRONG EM DEL A IMG H1 H2 H3 H4 H5 H6 UL OL LI BLOCKQUOTE PRE CODE TABLE THEAD TBODY TR TH TD FIGURE FIGCAPTION VIDEO SOURCE'.split(' '));
    for (const node of [...documentCopy.body.querySelectorAll('*')]) {
      if (!allowed.has(node.tagName)) { node.remove(); continue; }
      const href = node.getAttribute('href'), src = node.getAttribute('src'), alt = node.getAttribute('alt'), caption = node.getAttribute('title'), poster = node.getAttribute('poster'), start = node.getAttribute('start');
      for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);
      if (node.tagName === 'A' && href) {
        node.classList.add('link', inline ? 'link--inline' : 'link--article');
        if (href.startsWith('#')) node.setAttribute('href', href);
        else configureLink(node, url(href, origin));
      }
      if (node.tagName === 'IMG' && src) {
        node.src = url(src, origin, true); node.alt = alt || ''; node.loading = 'lazy'; node.decoding = 'async';
        if (caption && !inline) node.dataset.caption = caption;
      }
      if (!inline && ['VIDEO', 'SOURCE'].includes(node.tagName)) {
        if (src) node.src = url(src, origin, true);
        if (node.tagName === 'VIDEO') {
          node.controls = true; node.muted = false; node.autoplay = false;
          node.playsInline = true; node.preload = 'metadata';
          if (poster) node.poster = url(poster, origin, true);
        }
      }
      if (node.tagName === 'OL' && /^\d+$/.test(start || '')) node.setAttribute('start', start);
    }
    if (!inline) {
      // Стандартные Markdown-ссылки на MP4/WebM и image-синтаксис также работают как видео.
      for (const node of [...documentCopy.body.querySelectorAll('p > img, p > a')]) {
        const source = node.tagName === 'IMG' ? node.src : node.href;
        if (!source || mediaType(source) !== 'video' || node.parentElement.childNodes.length !== 1) continue;
        const video = element('video'); video.src = source; video.controls = true;
        video.playsInline = true; video.preload = 'metadata';
        const label = node.alt || node.textContent;
        if (label) video.setAttribute('aria-label', label);
        const figure = element('figure'); figure.append(video);
        if (node.dataset.caption) figure.append(element('figcaption', '', pair(node.dataset.caption)));
        node.parentElement.replaceWith(figure);
      }
      for (const image of documentCopy.body.querySelectorAll('img[data-caption]')) {
        const caption = image.dataset.caption; delete image.dataset.caption;
        if (image.parentElement.tagName !== 'P' || image.parentElement.childNodes.length !== 1) continue;
        const paragraph = image.parentElement, figure = element('figure');
        paragraph.replaceWith(figure); figure.append(image, element('figcaption', '', pair(caption)));
      }
      for (const table of [...documentCopy.body.querySelectorAll('table')]) {
        const wrapper = element('div', 'article-table'); table.replaceWith(wrapper); wrapper.append(table);
      }
    }
    const fragment = document.createDocumentFragment();
    fragment.append(...documentCopy.body.childNodes);
    return fragment;
  }
  function renderRich(node) {
    const inline = node.dataset.mdBlock !== 'true';
    node.replaceChildren(markdownFragment(node.dataset[language() === 'en' ? 'mdEn' : 'mdRu'], base, inline));
    // Обычный текст главной использует тот же компонент ссылок, что и hero.
    if (!inline) node.querySelectorAll('a.link--article').forEach(a => {
      a.classList.replace('link--article', 'link--inline');
    });
  }
  function rich(node, value, inline = true) {
    // Сначала проверяем оба перевода, чтобы ошибочная ссылка не ломала переключение языка.
    markdownFragment(value.ru, base, inline); markdownFragment(value.en, base, inline);
    delete node.dataset.ru; delete node.dataset.en;
    node.dataset.mdRu = value.ru; node.dataset.mdEn = value.en;
    node.dataset.mdBlock = String(!inline);
    renderRich(node);
    return node;
  }
  async function read(address) {
    return ContentState.read(address);
  }
  // Тип можно указать явно для CDN-ссылок без расширения; GIF остаётся изображением.
  function mediaType(source, type = 'auto') {
    if (!['auto', 'image', 'gif', 'video'].includes(type)) throw new Error('Тип медиа: auto, image или video');
    if (type !== 'auto') return type === 'gif' ? 'image' : type;
    return /\.(mp4|webm|mov)$/i.test(new URL(source, base).pathname) ? 'video' : 'image';
  }
  function previewMedia(source, type, className, poster = null) {
    const media = element(type === 'video' ? 'video' : 'img', className);
    if (type === 'video') {
      media.dataset.sitePreview = '';
      media.muted = true; media.defaultMuted = true; media.autoplay = true;
      media.loop = true; media.playsInline = true; media.controls = false;
      media.preload = 'none';
      media.setAttribute('muted', ''); media.setAttribute('playsinline', '');
      if (poster) media.poster = poster;
    } else { media.alt = ''; media.loading = 'lazy'; media.decoding = 'async'; }
    if (type === 'video') media.dataset.previewSrc = source;
    else media.src = source;
    return media;
  }
  function imageWidth(value) {
    if (value === 'full') return '100%';
    if (value === 'min') return 'var(--case-description-width)';
    if (/^\d+(?:\.\d+)?(?:px)?$/.test(value) && parseFloat(value) > 0) return parseFloat(value) + 'px';
    throw new Error('Ширина: full, min или положительное число');
  }
  const localizedUrl = (ru, en) => pair(url(ru), url(en || ru));
  function links(rows) { return rows.map(([ru, en, href, hrefEn]) => ({ label: pair(ru, en), href: localizedUrl(href, hrefEn) })); }
  // Пути CMS переопределяют только языковые значения; переключение — через html[lang].
  const cursorSettings = {
    default: [0, 0, 'default'], link: [0, 0, 'pointer'],
    email: [0, 0, 'pointer'], avatar: [0, 0, 'pointer'],
    close: [0, 0, 'pointer'], text: [12, 14, 'text']
  };
  function cursorValues(section) {
    const settings = section['Курсоры'] ? Object.fromEntries(rows(section, 'Курсоры').map(([key, ru, en]) => [key, { ru, en: en || ru }])) : {};
    return Object.entries(cursorSettings).flatMap(([key, [x, y, fallback]]) => {
      const shared = key === 'close' || key === 'text';
      return (shared ? ['ru'] : ['ru', 'en']).map(lang => {
        const path = settings[key]?.[lang];
        return [`--cursor-${key}${shared ? '' : '-' + lang}`, path ? `url(${JSON.stringify(url(path, base, true))}) ${x} ${y}, ${fallback}` : null];
      });
    });
  }
  function compile(source) {
    const s = sections(source);
    const nav = rows(s, 'Навигация').map(([ru, en, href]) => {
      if (!/^#[\w-]+$/.test(href) || !document.getElementById(href.slice(1))) throw new Error('Не найден якорь: ' + href);
      return { label: pair(ru, en), href };
    });
    const hero = fields(s, 'Главный заголовок', ['Имя', 'Подзаголовок']);
    const avatar = fields(s, 'Аватарка', ['Подпись', 'Подсказка звука']);
    const media = Object.fromEntries(rows(s, 'Аватарка', 1));
    const description = fields(s, 'Описание', ['Текст'])['Текст'];
    const state = fields(s, 'Статус', ['Текст'])['Текст'];
    const caseCloseLabel = fields(s, 'Окно кейса', ['Кнопка закрытия'])['Кнопка закрытия'];
    const buttons = Object.fromEntries(rows(s, 'Кнопки').map(([key, ru, en, href, hrefEn]) => [key, { label: pair(ru, en), href: localizedUrl(href, hrefEn) }]));
    if (!buttons.Telegram || !buttons.CV) throw new Error('Нужны строки Telegram и CV');
    const works = fields(s, 'Работы', ['Заголовок', 'Описание']);
    const cards = Object.keys(s).filter(name => name.startsWith('Кейс:')).map(name => {
      const copy = fields(s, name, ['Название', 'Год', 'Описание', 'Теги']);
      // Таблицы карточки ищем по шапке: порядок таблиц в site.md может меняться.
      const tables = (s[name] || []).filter(token => token.type === 'table');
      const bodyRows = table => table.rows.map(row => row.map(cell => cell.text.trim()));
      const tableHeader = table => (table.header || []).map(cell => cell.text.trim());
      const findTable = keys => tables.find(table => keys.every(key => tableHeader(table).includes(key)));
      const parameterTable = findTable(['Параметр', 'Значение']);
      const settings = parameterTable ? Object.fromEntries(bodyRows(parameterTable)) : {};
      const media = caseGallery(findTable(['Медиа']));
      const linkTable = findTable(['URL RU', 'URL EN']);
      // Блок без таблицы галереи: единственный кадр берётся из поля «Медиа».
      const legacy = settings['Медиа'] || settings['Изображение'];
      if (!media.length && legacy) {
        media.push({ source: url(legacy, base, true), type: mediaType(legacy, settings['Тип'] || 'auto'),
          width: null, caption: pair(''), mobile: null });
      }
      if (!media.length) throw new Error('Нет первой картинки в карточке «' + name.slice(5).trim() + '»');
      // Мобильную обложку из старой записи относим к первому кадру.
      if (!media[0].mobile && settings['Медиа для мобильных']) {
        media[0].mobile = { source: url(settings['Медиа для мобильных'], base, true),
          type: mediaType(settings['Медиа для мобильных'], settings['Тип для мобильных'] || 'auto') };
      }
      return { id: name.slice(5).trim(), copy, media,
        tagColors: (settings['Цвета тегов'] || '').split(';').map(value => value.trim()),
        width: media[0].width || imageWidth('full'),
        href: localizedUrl(settings['URL RU'] || settings.URL, settings['URL EN']),
        links: linkTable ? links(bodyRows(linkTable)) : [] };
    });
    const archive = s['Архивное'] ? fields(s, 'Архивное', ['Заголовок', 'Подпись']) : null;
    const archiveCards = Object.keys(s).filter(name => name.startsWith('Архив:')).map(name => {
      const copy = fields(s, name, ['Название', 'Описание', 'Роль', 'Год', 'Ссылка']);
      const settings = Object.fromEntries(rows(s, name, 1));
      return { copy, image: url(settings['Обложка'], base, true),
        href: localizedUrl(settings['URL RU'], settings['URL EN']) };
    });
    const gallery = fields(s, 'Дизайн-артефакты', ['Заголовок', 'Описание']);
    const artifacts = rows(s, 'Дизайн-артефакты', 1).map(([ru, en, type, href, preview, width, height]) => {
      type = mediaType(href, type || 'auto');
      if ([width, height].some(x => x && (!/^\d+$/.test(x) || +x <= 0))) throw new Error('Размеры артефакта: положительные числа или пустые ячейки');
      return { label: pair(ru, en), type, href: url(href, base, true), preview: url(preview || href, base, true), width, height };
    });
    const about = fields(s, 'Обо мне', ['Заголовок', 'Подзаголовок', 'Заголовок опыта', 'Заголовок инструментов', 'Раскрыть инструменты', 'Свернуть инструменты']);
    const aboutPhoto = about['Фото']?.ru ? url(about['Фото'].ru, base, true) : '';
    const aboutRows = name => rows(s, name).map(([ru, en, valueRu, valueEn]) => ({ label: pair(ru, en), value: pair(valueRu, valueEn) }));
    const prose = name => {
      const source = lang => (s[`${name} ${lang}`] || []).map(token => token.raw).join('').trim();
      return pair(source('RU'), source('EN'));
    };
    const aboutSummary = aboutRows('Сводка'), aboutTools = prose('Инструменты'), aboutIntro = prose('Вступление');
    const aboutExperience = rows(s, 'Опыт работы').map(([ru, en, roleRu, roleEn, dateRu, dateEn, logo]) => ({
      company: pair(ru, en), role: pair(roleRu, roleEn), date: pair(dateRu, dateEn),
      logo: logo ? url(logo, base, true) : null
    }));
    const aboutRichValues = aboutSummary.map(row => row.value)
      .concat(aboutExperience.flatMap(row => [row.company, row.role, row.date]), [aboutIntro, aboutTools]);
    const publications = fields(s, 'Публикации', ['Заголовок', 'Описание']);
    const publicationItems = rows(s, 'Публикации', 1).map(([ru, en, descriptionRu, descriptionEn, captionRu, captionEn, image, href]) => ({
      title: pair(ru, en), description: pair(descriptionRu, descriptionEn), caption: pair(captionRu, captionEn),
      image: url(image, base, true), href: href ? url(href) : null
    }));
    const contacts = fields(s, 'Контакты', ['Заголовок', 'Описание']);
    const contactLinks = links(rows(s, 'Контакты', 1));
    const footer = fields(s, 'Футер', ['Метаданные', 'Примечание']);
    [...aboutRichValues, description, works['Описание'], gallery['Описание'], publications['Описание'], contacts['Описание'], ...Object.values(footer)].forEach(value => {
      markdownFragment(value.ru, base, true); markdownFragment(value.en, base, true);
    });
    const tabSettings = s['Настройки вкладки'] ? fields(s, 'Настройки вкладки', []) : {};
    const favicon = tabSettings.Favicon ? url(tabSettings.Favicon.ru, base, true) : null;
    const toastLabels = s['Уведомления'] ? fields(s, 'Уведомления', []) : {};
    const loadingLabels = s['Состояния контента'] ? fields(s, 'Состояния контента', []) : {};
    return { cursors: cursorValues(s), tabSettings, favicon, toastLabels, loadingLabels, nav, hero, avatar, avatarMedia: url(media['Превью'] || media.GIF, base, true), avatarType: mediaType(media['Превью'] || media.GIF, media['Тип превью'] || 'auto'), avatarPoster: media['Постер'] ? url(media['Постер'], base, true) : null, video: url(media['Видео'], base, true),
      description, state, caseCloseLabel, buttons, works, cards, archive, archiveCards, gallery, artifacts, about, aboutPhoto, aboutSummary, aboutExperience, aboutTools, aboutIntro, publications, publicationItems, contacts, contactLinks, footer };
  }
  // В DOM живёт только версия текущего брейкпоинта: второй файл не грузим.
  // На телефоне можно подставить свой кадр (например, 3:4 вместо 16:9).
  // Первый кадр рядом с роликом: <имя>-poster.jpg. Его готовит build_index.py,
  // чтобы карточка показывала заглушку, не скачивая видео целиком.
  const posterFor = source => /\.(mp4|webm|mov)$/i.test(source) ? source.replace(/\.(mp4|webm|mov)$/i, '-poster.jpg') : null;
  function renderFigureMedia(anchor) {
    const entry = figureMedia.get(anchor);
    if (!entry) return;
    const current = mobileCaseMedia.matches && entry.mobile ? entry.mobile : entry;
    const key = JSON.stringify([current.source, current.type]);
    if (anchor.dataset.mediaKey === key) return;
    const previous = anchor.querySelector('video');
    // Кадр открывается в просмотрщике, а не в модалке.
    anchor.href = current.source;
    if (current.type === 'video') anchor.dataset.type = 'html5video';
    else delete anchor.dataset.type;
    anchor.replaceChildren(previewMedia(current.source, current.type, 'work-image', posterFor(current.source)));
    anchor.dataset.mediaKey = key;
    if (previous) {
      previous.pause(); previous.removeAttribute('src');
      delete previous.dataset.previewSrc; previous.load();
    }
  }
  mobileCaseMedia.addEventListener('change', () => {
    document.querySelectorAll('.work-figure__link').forEach(renderFigureMedia);
    applyVideoAutoplay();
  });
  function card(data) {
    const item = element('article', 'work-item'); item.dataset.case = data.id;
    const info = element('div', 'work-info'), heading = element('div', 'work-heading'), title = element('h3', 'work-title-heading');
    title.append(link(data.href, data.copy['Название'], 'link link--plain work-title'));
    heading.append(title, element('span', 'work-year', data.copy['Год'])); info.append(heading);
    if (data.copy['Описание'].ru) info.append(element('p', 'work-description', data.copy['Описание']));
    const tags = element('div', 'work-tags');
    const ru = data.copy['Теги'].ru.split(';').map(s => s.trim()).filter(Boolean);
    const en = data.copy['Теги'].en.split(';').map(s => s.trim()).filter(Boolean);
    const tagPalette = ['blue', 'violet', 'green', 'pink', 'orange', 'lime', 'gray'];
    // Последовательность автоматических цветов сохраняем для существующих карточек.
    const tagColors = [...tagPalette, 'red', 'yellow', 'amber', 'cyan', 'teal', 'purple', 'indigo', 'brown'];
    const tagAliases = { grey: 'gray', turquoise: 'teal', aqua: 'cyan', gold: 'amber' };
    ru.forEach((tag, i) => {
      const badge = element('span', 'work-tag', pair(tag.replace(/^#/, ''), (en[i] || tag).replace(/^#/, '')));
      const entered = (data.tagColors[i] || tagPalette[i % tagPalette.length]).trim().toLowerCase();
      const choice = tagAliases[entered] || entered;
      const color = tagColors.includes(choice) ? `var(--tag-${choice})`
        : /^hsla?\(/i.test(choice) && CSS.supports('color', choice) ? choice
        : `var(--tag-${tagPalette[i % tagPalette.length]})`;
      badge.style.setProperty('--tag-color', color);
      tags.append(badge);
    });
    if (ru.length) info.append(tags);
    const extra = element('div', 'work-links'); data.links.forEach(row => extra.append(link(row.href, row.label, 'link link--inline work-link')));
    if (data.links.length) info.append(extra);
    item.append(info);

    // Сторителлинг: текст сверху, кадры друг за другом снизу. Первый кадр —
    // обложка. Все кадры открываются в просмотрщике одного кейса.
    const group = 'case-gallery-' + data.id;
    const gallery = element('div', 'work-gallery');
    data.media.forEach((entry, index) => {
      const figure = element('figure', 'work-figure');
      figure.style.setProperty('--work-image-width', entry.width || data.width);
      const fallback = pair(data.copy['Название'].ru + ' — кадр ' + (index + 1), data.copy['Название'].en + ' — frame ' + (index + 1));
      const anchor = translated(element('a', 'link link--card work-figure__link'), entry.caption.ru ? entry.caption : fallback, true);
      anchor.dataset.fancybox = group;
      figureMedia.set(anchor, entry);
      renderFigureMedia(anchor);
      figure.append(anchor);
      if (entry.caption.ru) figure.append(element('figcaption', 'work-caption', entry.caption));
      gallery.append(figure);
    });
    item.append(gallery);
    return item;
  }
  function archiveCard(data) {
    const item = element('article', 'archive-card');
    const info = element('div', 'archive-copy');
    const title = element('h4', 'work-title-heading');
    title.append(link(data.href, data.copy['Название'], 'link link--plain work-title'));
    info.append(title);
    for (const field of ['Описание', 'Роль', 'Год']) {
      info.append(element('p', field === 'Год' ? 'work-year' : 'archive-detail', data.copy[field]));
    }
    const action = element('div', 'archive-action');
    action.append(link(data.href, data.copy['Ссылка'], 'link link--inline'));
    info.append(action);
    const cover = translated(link(data.href, null, 'link link--card archive-cover'), data.copy['Название'], true);
    cover.append(previewMedia(data.image, 'image', 'archive-image'));
    item.append(info, cover);
    return item;
  }
  function artifact(data) {
    const figure = element('figure', 'gallery-item');
    const anchor = element('a', 'link link--card'); anchor.href = data.href; anchor.dataset.fancybox = 'artifacts';
    translated(anchor, data.label, true);
    if (data.type === 'video') anchor.dataset.type = 'html5video';
    const previewType = data.preview === data.href ? data.type : mediaType(data.preview);
    const media = previewMedia(data.preview, previewType, previewType === 'video' ? 'gallery-video' : '');
    if (data.width) { media.width = +data.width; anchor.dataset.width = data.width; }
    if (data.height) { media.height = +data.height; anchor.dataset.height = data.height; }
    anchor.append(media);
    figure.append(anchor, element('figcaption', '', data.label)); return figure;
  }
  function publication(data) {
    const item = element(data.href ? 'a' : 'article', data.href ? 'link link--card publication-card' : 'publication-card');
    if (data.href) {
      item.href = data.href;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
      translated(item, data.title, true);
    }
    const frame = element('div', 'publication-image');
    const image = element('img'); image.src = data.image; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
    frame.append(image);
    const title = element('h3', 'publication-title', data.title);
    item.append(frame, title, element('p', 'publication-description', data.description), element('p', 'publication-caption', data.caption));
    return item;
  }
  // Логотипы сопоставлены с существующими компаниями; таблица опыта в MD не меняется.
  let toolsObserver;
  function syncToolsToggle() {
    const text = document.getElementById('aboutToolsText');
    const toggle = document.querySelector('.about-tools-toggle');
    if (!text || !toggle) return;
    const lines = Number(getComputedStyle(text).getPropertyValue('--about-tools-lines'));
    toggle.hidden = text.scrollHeight <= parseFloat(getComputedStyle(text).lineHeight) * lines + 1;
  }
  function aboutContent(data) {
    const fragment = document.createDocumentFragment();
    const makeRow = (label, value) => {
      const row = element('div', 'about-row');
      row.append(element('h3', 'about-label', label), rich(element('div', 'about-value'), value));
      return row;
    };
    const makeJobs = jobs => {
      const list = element('ul', 'experience-list');
      for (const job of jobs) {
        const item = element('li', 'experience-item');
        const avatar = element('span', 'experience-avatar');
        avatar.setAttribute('aria-hidden', 'true');
        const source = job.logo;
        if (source) {
          const image = element('img'); image.src = source; image.alt = '';
          image.width = 64; image.height = 64; image.loading = 'lazy';
          avatar.append(image);
        }
        const copy = element('div', 'experience-copy');
        copy.append(rich(element('div', 'experience-heading'), job.company), rich(element('p'), job.role), rich(element('p', 'experience-date'), job.date));
        item.append(avatar, copy); list.append(item);
      }
      return list;
    };
    const summary = element('div', 'about-panel');
    summary.append(element('h2', 'about-heading', data.about['Подзаголовок']));
    data.aboutSummary.forEach(row => summary.append(makeRow(row.label, row.value)));
    fragment.append(summary);
    if (data.aboutExperience.length) {
      const experience = element('div', 'about-panel');
      experience.append(element('h2', 'about-heading', data.about['Заголовок опыта']));
      experience.append(makeJobs(data.aboutExperience));
      fragment.append(experience);
    }
    if (data.aboutTools.ru) {
      const tools = element('div', 'about-panel about-tools');
      const text = rich(element('div', 'about-tools-text'), data.aboutTools, false);
      text.id = 'aboutToolsText';
      const toggle = element('button', 'link link--plain disclosure-toggle about-tools-toggle');
      toggle.type = 'button'; toggle.setAttribute('aria-controls', text.id);
      const expanded = document.querySelector('.about-tools-toggle')?.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(expanded)); text.classList.toggle('is-expanded', expanded);
      toggle.append(element('span', 'about-tools__expand', data.about['Раскрыть инструменты']), element('span', 'about-tools__collapse', data.about['Свернуть инструменты']));
      const icon = element('span', 'icon icon--down'); icon.setAttribute('aria-hidden', 'true'); toggle.append(icon);
      toggle.addEventListener('click', event => {
        uiSounds?.playUISound('toggle'); event.uiSoundHandled = true;
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expanded)); text.classList.toggle('is-expanded', expanded);
      });
      tools.append(element('h2', 'about-heading', data.about['Заголовок инструментов']), text, toggle);
      fragment.append(tools);
    }
    return fragment;
  }
  // Только превью главной: статья внутри #caseDialog не входит в этот селектор.
  function syncVideos() {
    document.querySelectorAll('video[data-site-preview]').forEach(video => {
      if (!video.dataset.autoplayBlocked && !video.dataset.previewSrc && !document.hidden && !document.querySelector('.fancybox__container') && video.getBoundingClientRect().bottom > -300 && video.getBoundingClientRect().top < innerHeight + 300) video.play().catch(() => {});
      else video.pause();
    });
  }
  // Беззвучные видео играют сами, видео со звуком — только по действию
  // пользователя: иначе на странице была бы каша из звуков. Список беззвучных
  // готовит build_index.py в assets/video/audio-manifest.json.
  let audioManifest = null;
  async function readAudioManifest() {
    if (audioManifest) return audioManifest;
    try {
      const response = await fetch(new URL('assets/video/audio-manifest.json', base), { cache: 'default' });
      audioManifest = response.ok ? await response.json() : {};
    } catch { audioManifest = {}; }
    return audioManifest;
  }
  function mediaPath(address) {
    try { return decodeURIComponent(new URL(address, location.href).pathname.replace(/^\/+/, '')); }
    catch { return ''; }
  }
  async function applyVideoAutoplay() {
    // «Видео о себе» — отдельный плеер: им управляет main.js, правило звука
    // для превью на него не распространяется.
    const pending = [...document.querySelectorAll('video')].filter(video =>
      !video.dataset.audioApplied && !video.closest('.fancybox__container') && video.id !== 'aboutVideo');
    // В просмотрщике кейса видео живёт недолго, поэтому обрабатываем его отдельно.
    const viewer = [...document.querySelectorAll('.fancybox__container video')].filter(video => !video.dataset.viewerApplied);
    if (!pending.length && !viewer.length) return;
    const manifest = await readAudioManifest();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const video of viewer) {
      // Играем только тот ролик, чей кадр сейчас открыт: скрытые слайды
      // остаются на паузе и не запускаются в фоне.
      if (!video.closest('.fancybox__slide')?.classList.contains('is-selected')) continue;
      const source = video.currentSrc || video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
      if (!source) continue;
      const info = manifest[mediaPath(source)];
      if (!info) continue;
      const hasSound = info.audio;
      video.dataset.viewerApplied = '';
      // Как у артефактов: ролик стартует сразу при открытии кадра. Автоплей
      // разрешён только без звука, поэтому запускаем беззвучно — звук
      // включается кнопкой в плеере. Зацикливаем только ролики без дорожки.
      video.controls = true;
      if (!hasSound) video.loop = true;
      if (reduced) { video.muted = false; continue; }
      video.muted = true;
      video.play().catch(() => {});
    }
    if (!pending.length) return;
    for (const video of pending) {
      const source = video.currentSrc || video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
      if (!source) continue;
      const info = manifest[mediaPath(source)];
      if (!info) continue;
      const hasSound = info.audio;
      video.dataset.audioApplied = '';
      if (hasSound) {
        // Звук есть: автозапуск выключаем и останавливаем, если он уже пошёл.
        // Тянуть весь файл ради кадра не нужно — хватает метаданных.
        video.dataset.autoplayBlocked = '';
        video.autoplay = false;
        video.removeAttribute('autoplay');
        video.preload = 'metadata';
        if (!video.paused) video.pause();
      } else if (!reduced) {
        video.autoplay = true;
        video.setAttribute('autoplay', '');
        video.playsInline = true;
        video.play().catch(() => {});
      }
    }
  }
  window.applyVideoAutoplay = applyVideoAutoplay;
  applyVideoAutoplay();
  document.addEventListener('DOMContentLoaded', applyVideoAutoplay);
  document.addEventListener('gallery-viewer-close', () => applyVideoAutoplay());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) applyVideoAutoplay(); });
  new MutationObserver(() => applyVideoAutoplay())
    .observe(document.body, { childList: true, subtree: true });

  // Повторная попытка после жеста, если браузер заблокировал autoplay.
  document.addEventListener('pointerdown', syncVideos, { passive: true });
  document.addEventListener('keydown', syncVideos);
  function changed(key, value, apply) {
    const fingerprint = JSON.stringify(value);
    if (applied.get(key) === fingerprint) return;
    apply(); applied.set(key, fingerprint);
  }
  function apply(data) {
    changed('cursors', data.cursors, () => data.cursors.forEach(([name, value]) => {
      if (value) document.documentElement.style.setProperty(name, value);
      else document.documentElement.style.removeProperty(name);
    }));
    ContentState.configure(data.loadingLabels);
    configureToast(data.toastLabels);
    if (data.tabSettings.Title) translated(document.querySelector('title'), data.tabSettings.Title);
    if (data.favicon) document.getElementById('siteFavicon').href = data.favicon;
    const text = (selector, value) => translated(document.querySelector(selector), value);
    changed('nav', data.nav, () => {
      document.getElementById('primaryNavigation').replaceChildren(...data.nav.map(row => {
        const a = element('a', 'link link--nav', row.label); a.setAttribute('href', row.href); return a;
      }));
      updateActiveNav();
    });
    text('#heroName', data.hero['Имя']); text('#heroSubtitle', data.hero['Подзаголовок']);
    text('#avatarCaption', data.avatar['Подпись']); text('#heroStatus', data.state);
    text('#aboutVideoHint', data.avatar['Подсказка звука']);
    text('.case-modal__close-action', data.caseCloseLabel);
    changed('avatarMedia', [data.avatarMedia, data.avatarType, data.avatarPoster], () => {
      const previous = document.querySelector('.avatar__image');
      if (data.avatarType !== 'image') {
        previous.replaceWith(previewMedia(data.avatarMedia, data.avatarType, 'avatar__image', data.avatarPoster));
        return;
      }
      if (!data.avatarPoster) {
        previous.replaceWith(previewMedia(data.avatarMedia, 'image', 'avatar__image'));
        return;
      }
      // Мгновенно показываем лёгкий статичный кадр, анимацию подставляем,
      // когда она догрузилась: первый экран не ждёт тяжёлого GIF.
      const poster = previewMedia(data.avatarPoster, 'image', 'avatar__image');
      previous.replaceWith(poster);
      const full = new Image();
      full.decoding = 'async';
      full.onload = () => {
        const current = document.querySelector('.avatar__image');
        if (current && current.isConnected && current.src !== full.src) current.replaceWith(previewMedia(data.avatarMedia, 'image', 'avatar__image'));
      };
      full.src = data.avatarMedia;
    });
    // src не ставим: 18 МБ начнут качаться раньше времени. Ссылку и
    // длительность берём из манифеста, сам файл грузится по клику на аватарку.
    const video = document.getElementById('aboutVideo');
    if (video.dataset.src !== data.video) {
      video.removeAttribute('src');
      video.dataset.src = data.video;
      readAudioManifest().then(manifest => {
        const info = manifest[mediaPath(data.video)];
        if (!info || !info.duration) return;
        video.dataset.duration = String(info.duration);
        document.dispatchEvent(new Event('avatar-duration'));
      });
    }
    rich(document.getElementById('heroDescription'), data.description);
    for (const [name, id] of [['Telegram', 'telegramCTA'], ['CV', 'cvCTA'], ['Presentation', 'presentationCTA']]) {
      const a = document.getElementById(id), value = data.buttons[name];
      a.hidden = !value;
      if (!value) continue;
      configureLink(a, value.href);
      translated(name === 'Telegram' ? a.querySelector('span') : a, value.label);
    }
    for (const [name, id] of [['Telegram', 'headerContactCTA'], ['CV', 'headerCvCTA']]) {
      const a = document.getElementById(id), value = data.buttons[name];
      configureLink(a, value.href);
      translated(a, value.label, true);
    }
    text('#headerContactCTA .header-contact-label', data.buttons.Telegram.label);
    text('#works .section-label', data.works['Заголовок']);
    const worksDescription = document.getElementById('worksDescription');
    rich(worksDescription, data.works['Описание']); worksDescription.hidden = !data.works['Описание'][language()];
    changed('cards', data.cards, () => document.querySelector('.works-list').replaceChildren(...data.cards.map(card)));
    changed('archive', [data.archive, data.archiveCards], () => {
      const archive = document.getElementById('worksArchive');
      archive.hidden = !data.archive || !data.archiveCards.length;
      if (data.archive) {
        text('#archiveTitle', data.archive['Заголовок']);
        text('#archiveHint', data.archive['Подпись']);
      }
      archive.querySelector('.archive-list').replaceChildren(...data.archiveCards.map(archiveCard));
    });
    text('#gallery .section-label span', data.gallery['Заголовок']);
    rich(document.querySelector('#gallery .section-hint'), data.gallery['Описание']);
    changed('artifacts', data.artifacts, () => {
      document.querySelectorAll('.gallery-video').forEach(video => video.pause());
      document.querySelector('.gallery-grid').replaceChildren(...data.artifacts.map(artifact));
    });
    text('#about .section-label span', data.about['Заголовок']);
    changed('aboutContent', [data.about, data.aboutSummary, data.aboutExperience, data.aboutTools], () => {
      toolsObserver?.disconnect();
      document.getElementById('aboutContent').replaceChildren(aboutContent(data));
      const tools = document.getElementById('aboutToolsText');
      if (tools) {
        toolsObserver = new ResizeObserver(syncToolsToggle); toolsObserver.observe(tools);
      }
      syncToolsToggle();
    });
    changed('about-photo', [data.aboutPhoto, data.about['Подпись фото']], () => {
      const figure = document.getElementById('aboutPhoto');
      figure.replaceChildren(); figure.hidden = !data.aboutPhoto;
      if (data.aboutPhoto) {
        const image = previewMedia(data.aboutPhoto, 'image', 'about-photo__image');
        const anchor = element('a', 'link link--card about-photo__link');
        anchor.href = data.aboutPhoto;
        anchor.dataset.fancybox = 'about-photo';
        anchor.dataset.type = 'image';
        anchor.setAttribute('aria-haspopup', 'dialog');
        anchor.setAttribute('aria-labelledby', 'aboutPhotoCaption');
        anchor.append(image);
        const caption = element('figcaption', '', data.about['Подпись фото'] || pair(''));
        caption.id = 'aboutPhotoCaption';
        figure.append(anchor, caption);
      }
    });
    const about = document.getElementById('aboutDescription'); rich(about, data.aboutIntro, false); about.hidden = !data.aboutIntro[language()];
    text('#publications .section-label span', data.publications['Заголовок']);
    const publicationDescription = document.getElementById('publicationsDescription');
    rich(publicationDescription, data.publications['Описание']); publicationDescription.hidden = !data.publications['Описание'][language()];
    changed('publications', data.publicationItems, () => document.querySelector('.publications-grid').replaceChildren(...data.publicationItems.map(publication)));
    text('#contacts .section-label span', data.contacts['Заголовок']);
    rich(document.querySelector('#contacts .section-hint'), data.contacts['Описание']);
    changed('contacts', data.contactLinks, () => document.querySelector('.contact-links').replaceChildren(...data.contactLinks.map(row => link(row.href, row.label, 'link link--display'))));
    document.querySelectorAll('.works-list, #aboutContent, .publications-grid').forEach(node => {
      node.dataset.contentLoaded = 'true'; node.setAttribute('aria-busy', 'false');
    });
    syncVideos();
    applyVideoAutoplay();
    for (const [name, selector] of [['Метаданные', '.footer-meta'], ['Примечание', '.footer-note']]) {
      changed('footer-' + name, data.footer[name], () => rich(document.querySelector(selector), data.footer[name]));
    }
    // Показываем hero только после заполнения из Markdown, без HTML-копии контента.
    const loading = document.getElementById('heroLoading');
    loading.replaceChildren(); loading.hidden = true; loading.dataset.contentLoaded = 'true';
    document.getElementById('hero').removeAttribute('data-cms-pending');
    document.querySelectorAll('#gallery > .gallery-grid, .contact-links').forEach(node => {
      node.dataset.contentLoaded = 'true'; node.setAttribute('aria-busy', 'false');
    });
    updateHeaderActions();
  }
  function articleTranslation(source) {
    // Языковые разделы необязательны. Внутри — свободный Markdown, без схемы карточки.
    const parts = {}; let current = null;
    for (const token of marked.lexer(source)) {
      if (token.type === 'heading' && token.depth === 2 && ['Русский', 'English'].includes(token.text)) {
        current = token.text === 'Русский' ? 'ru' : 'en'; parts[current] = '';
      } else if (current) parts[current] += token.raw;
    }
    return parts[language()] || parts.ru || parts.en || source;
  }
  function renderArticle() {
    if (!article || article.source === null) return;
    const fragment = markdownFragment(articleTranslation(article.source), article.url);
    // В статье любое видео запускается только самим читателем —
    // независимо от HTML-атрибутов и Markdown-синтаксиса источника.
    fragment.querySelectorAll('video').forEach(video => {
      video.autoplay = false;
      video.removeAttribute('autoplay');
      video.removeAttribute('data-site-preview');
      video.controls = true;
      video.preload = 'metadata';
    });
    // Самостоятельное медиа (с подписью или без) занимает широкую колонку.
    // Встроенные в текст, список или таблицу изображения не расширяют весь текст.
    for (let block of [...fragment.children]) {
      if (block.matches('img, video')) {
        const figure = element('figure');
        block.replaceWith(figure);
        figure.append(block);
        block = figure;
      }
      if (block.matches('img, video') ||
          (block.matches('figure') && block.querySelector('img, video')) ||
          (block.matches('p, a') && block.querySelector('img, video') && !block.textContent.trim())) {
        block.classList.add('article-media');
      }
    }
    // Только изображения (включая GIF). Видео сохраняют собственный плеер.
    for (const [index, image] of [...fragment.querySelectorAll('img')].entries()) {
      let anchor = image.closest('a');
      if (!anchor) {
        anchor = element('a'); image.replaceWith(anchor); anchor.append(image);
      }
      anchor.classList.add('case-image-link');
      if (image.classList.contains('article-media')) anchor.classList.add('article-media');
      anchor.href = image.src;
      // Своя группа для каждой картинки: никакого перелистывания статьи.
      anchor.dataset.fancybox = 'case-image-' + index;
      anchor.dataset.type = 'image';
      delete anchor.dataset.openCase;
      ['target', 'rel', 'aria-controls', 'data-href-ru', 'data-href-en'].forEach(name => anchor.removeAttribute(name));
      anchor.setAttribute('aria-haspopup', 'dialog');
      anchor.setAttribute('aria-label', image.alt || (language() === 'ru' ? 'Открыть изображение' : 'Open image'));
    }
    const heading = fragment.querySelector('h1');
    dialog.setAttribute('aria-label', heading ? heading.textContent : article.label);
    content.replaceChildren(fragment);
    content.setAttribute('aria-busy', 'false');
    applyVideoAutoplay();
  }
  async function loadArticle(initial = false) {
    if (!article || article.loading) return;
    const current = article, request = ++articleRequest;
    current.loading = true;
    try {
      const source = await read(current.url);
      if (article !== current || request !== articleRequest || !dialog.open) return;
      if (source !== current.source) {
        const previous = current.source;
        current.source = source;
        try { renderArticle(); } catch (error) { current.source = previous; throw error; }
      }
    } catch (error) {
      if (article !== current || request !== articleRequest) return;
      console.warn('Статья:', error.message);
      if (current.source === null) {
        ContentState.panel(content, true);
      }
    } finally { current.loading = false; }
  }
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[data-open-case]');
    if (!anchor || event.fromMediaViewer || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!event.uiSoundHandled) uiSounds?.playUISound('tap');
    event.uiSoundHandled = true;
    if (!dialog.open) {
      trigger = anchor;
      // Safari может показать focus-visible после программного фокуса при тапе.
      // Сам фокус сохраняем; обводку возвращаем при переходе к клавиатуре.
      dialog.classList.toggle('is-pointer-open', sheetQuery.matches && event.detail > 0);
      dialog.show();
      syncCaseSheet();
      const closeControl = dialog.querySelector(window.matchMedia('(max-width: 767px)').matches ? '.case-modal__close-action' : '.case-modal__close');
      closeControl.focus({ preventScroll: true });
    }
    article = { url: anchor.href, source: null, label: anchor.textContent || anchor.getAttribute('aria-label') || 'Кейс' };
    dialog.setAttribute('aria-label', article.label);
    ContentState.caseSkeleton(content);
    content.setAttribute('aria-busy', 'true'); body.scrollTop = 0;
    loadArticle(true);
  });
  document.addEventListener('click', event => {
    // Ссылка на MD открывает/меняет статью в обработчике выше.
    // Остальные клики снаружи закрывают окно, как у видео аватарки.
    if (!event.fromMediaViewer && dialog.open && (event.target === dialog || !dialog.contains(event.target)) && !event.target.closest('a[data-open-case]')) {
      if (!event.uiSoundHandled && !event.target.closest('a, button')) {
        uiSounds?.playUISound('press'); event.uiSoundHandled = true;
      }
      closeCaseDialog();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') dialog.classList.remove('is-pointer-open');
    if (!event.fromMediaViewer && dialog.open && sheetQuery.matches && event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('a[href], button, video[controls], input, [tabindex="0"]')].filter(node => !node.disabled && node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (!event.fromMediaViewer && dialog.open && event.key === 'Escape') {
      if (!event.defaultPrevented) uiSounds?.playUISound('press');
      event.preventDefault(); closeCaseDialog();
    }
  });
  dialog.querySelectorAll('[data-case-close]').forEach(button => button.addEventListener('click', event => {
    uiSounds?.playUISound('press'); event.uiSoundHandled = true;
    closeCaseDialog();
  }));
  let sheetGesture = null;
  let sheetGestureListenersAttached = false;
  let sheetClickBlockedUntil = 0;
  function resetSheetGesture() {
    sheetGesture = null;
    dialog.classList.remove('is-dragging');
    dialog.style.removeProperty('--case-sheet-drag');
  }
  function startSheetGesture(event) {
    resetSheetGesture();
    // Полоска свайпа (область с разделителем) сворачивает панель при любом
    // скролле статьи. Свайп по самой статье — только сверху, иначе он мешает
    // прокрутке.
    const fromHandle = !!event.target.closest('.case-modal__handle');
    if (!sheetQuery.matches || !dialog.open || event.touches.length !== 1 ||
        (!fromHandle && body.scrollTop > 1) ||
        document.querySelector('.fancybox__container') ||
        !event.target.closest('.case-modal__body, .case-modal__handle') ||
        event.target.closest('a:not(.case-image-link), button, video, input, textarea, select, .article-table, pre') ||
        window.getSelection()?.toString()) return;
    const touch = event.touches[0];
    sheetGesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, distance: 0, dragging: false, fromHandle };
  }
  function moveSheetGesture(event) {
    if (!sheetGesture) return;
    const touch = [...event.touches].find(item => item.identifier === sheetGesture.id);
    if (!touch || event.touches.length !== 1 || (!sheetGesture.fromHandle && body.scrollTop > 1)) { resetSheetGesture(); return; }
    const dy = touch.clientY - sheetGesture.y, dx = Math.abs(touch.clientX - sheetGesture.x);
    if (!sheetGesture.dragging) {
      if (dy < -8 || dx > Math.max(10, dy)) { resetSheetGesture(); return; }
      if (dy < 10) return;
    }
    if (!event.cancelable) { resetSheetGesture(); return; }
    event.preventDefault();
    sheetGesture.dragging = true;
    sheetGesture.distance = Math.max(0, dy);
    dialog.classList.add('is-dragging');
    dialog.style.setProperty('--case-sheet-drag', `${sheetGesture.distance}px`);
  }
  function endSheetGesture(event) {
    const dragged = sheetGesture?.dragging;
    const dismiss = dragged && sheetGesture.distance >= 80;
    if (dragged) {
      // Свайп по картинке не должен затем открывать её как обычный тап.
      if (event.cancelable) event.preventDefault();
      sheetClickBlockedUntil = performance.now() + 500;
    }
    resetSheetGesture();
    if (dismiss) dialog.querySelector('.case-modal__close-action').click();
  }
  // Отмена нативного жеста нужна только открытому мобильному bottom sheet.
  // На планшете/десктопе touchmove не перехватываем: скроллит сам браузер.
  function syncSheetGestureListeners(active) {
    if (active === sheetGestureListenersAttached) return;
    sheetGestureListenersAttached = active;
    resetSheetGesture();
    if (active) {
      dialog.addEventListener('touchstart', startSheetGesture, { passive: true });
      dialog.addEventListener('touchmove', moveSheetGesture, { passive: false });
      dialog.addEventListener('touchend', endSheetGesture, { passive: false });
      dialog.addEventListener('touchcancel', resetSheetGesture, { passive: true });
    } else {
      dialog.removeEventListener('touchstart', startSheetGesture);
      dialog.removeEventListener('touchmove', moveSheetGesture);
      dialog.removeEventListener('touchend', endSheetGesture);
      dialog.removeEventListener('touchcancel', resetSheetGesture);
    }
  }
  body.addEventListener('click', event => {
    if (performance.now() >= sheetClickBlockedUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  dialog.addEventListener('close', () => {
    resetSheetGesture();
    if (dialog.open) return;
    dialog.classList.remove('is-pointer-open');
    syncCaseSheet();
    article = null; articleRequest++;
    if (dialog.contains(document.activeElement) && trigger?.isConnected) trigger.focus({ preventScroll: true });
    content.replaceChildren();
  });
  document.addEventListener('languagechange', () => {
    document.querySelectorAll('[data-md-ru]').forEach(renderRich);
    document.querySelectorAll('a[data-href-ru]').forEach(a => configureLink(a, { ru: a.dataset.hrefRu, en: a.dataset.hrefEn }));
    syncToolsToggle();
    const about = document.getElementById('aboutDescription');
    about.hidden = !about.textContent.trim();
    renderArticle();
  });
  async function refresh() {
    if (busy || document.hidden) return;
    if (document.querySelector('.fancybox__container')) return;
    if (dialog.open) {
      busy = true;
      try {
        const source = await read(new URL('site.md', base));
        const label = fields(sections(source), 'Окно кейса', ['Кнопка закрытия'])['Кнопка закрытия'];
        translated(dialog.querySelector('.case-modal__close-action'), label);
      } catch (error) {
        console.warn('Case close label:', error.message); // Сохраняем уже загруженную подпись.
      } finally { busy = false; }
      if (dialog.open) await loadArticle();
      return;
    }
    if (document.querySelector('dialog[open], .fancybox__container')) return;
    busy = true;
    try {
      const source = await read(new URL('site.md', base));
      if (source !== signature && !document.querySelector('dialog[open], .fancybox__container')) {
        const data = compile(source);
        // Если редактирование изменило сфокусированную ссылку, возвращаем фокус без скролла.
        const focused = document.activeElement, href = focused?.getAttribute('href');
        apply(data); signature = source;
        if (!focused.isConnected && href) [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === href)?.focus({ preventScroll: true });
      }
      status.hidden = true;
    } catch (error) {
      console.warn('Markdown CMS:', error.message);
      status.hidden = true;
      ContentState.failEmptyBlocks();
    } finally {
      document.querySelector('.works-list').setAttribute('aria-busy', 'false'); busy = false;
      document.dispatchEvent(new Event('site-content-ready'));
    }
  }
  if (location.protocol === 'file:') {
    translated(status, pair(
      'Для загрузки контента откройте «Запустить сайт.command» в папке проекта. Браузер блокирует Markdown при открытии index.html двойным кликом.',
      'Open “Запустить сайт.command” in the project folder. Browsers block Markdown loading when index.html is opened directly as a file.'
    ));
    status.hidden = false;
    ContentState.failEmptyBlocks();
    document.querySelector('.works-list').setAttribute('aria-busy', 'false');
    return;
  }
  refresh();
  setInterval(refresh, local ? 2000 : 30000);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { refresh(); syncVideos(); });
  document.addEventListener('gallery-viewer-close', syncVideos);
})();
