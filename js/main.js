// Программный фокус при открытии модалки не должен рисовать обводку.
// Tab включает её на всём сайте, следующий клик/тап выключает.
document.addEventListener('keydown', function(event) {
  if (event.key === 'Tab') document.documentElement.classList.add('keyboard-navigation');
}, true);
document.addEventListener('pointerdown', function() {
  document.documentElement.classList.remove('keyboard-navigation');
}, true);

// Процедурные звуки из sound: один AudioContext, разблокировка первым жестом.
// Импорт не блокирует CMS; если звук недоступен, взаимодействия работают дальше.
var uiSounds = null;
import('./ui-sounds.js?v=d06a4a3a5b90').then(function(module) { uiSounds = module; }).catch(function() {});

// Ручной выбор → первый поддерживаемый язык браузера → русский.
var languageStorageKey = 'serge-portfolio-language';

function resolveLanguage(savedLanguage, browserLanguages) {
  if (savedLanguage === 'ru' || savedLanguage === 'en') return savedLanguage;
  for (var i = 0; i < browserLanguages.length; i++) {
    var language = browserLanguages[i].toLowerCase().split('-')[0];
    if (language === 'ru' || language === 'en') return language;
  }
  return 'ru';
}

function setLang(lang, remember) {
  if (lang !== 'ru' && lang !== 'en') return;
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.classList.remove('active');
  });
  document.querySelector('.lang-btn[data-lang="' + lang + '"]').classList.add('active');

  document.querySelectorAll('[data-' + lang + ']').forEach(function(el) {
    el.textContent = el.getAttribute('data-' + lang);
  });
  document.querySelectorAll('[data-aria-' + lang + ']').forEach(function(el) {
    el.setAttribute('aria-label', el.getAttribute('data-aria-' + lang));
  });
  document.dispatchEvent(new Event('languagechange'));
  if (remember !== false) {
    try {
      localStorage.setItem(languageStorageKey, lang);
    } catch (error) {
      // Переключение работает и при недоступном хранилище браузера.
    }
  }
}

(function () {
  var savedLanguage = null;
  try {
    savedLanguage = localStorage.getItem(languageStorageKey);
  } catch (error) {}
  var browserLanguages = navigator.languages && navigator.languages.length
    ? navigator.languages
    : (navigator.language ? [navigator.language] : []);
  // Автоопределение не сохраняем: при следующем визите учитываем настройки браузера.
  setLang(resolveLanguage(savedLanguage, browserLanguages), false);
})();

// Длительность из метаданных: 32с / 32s, 1м 22с / 1m 22s.
function formatVideoDuration(duration, lang) {
  if (!Number.isFinite(duration) || duration <= 0) return '';
  var totalSeconds = Math.round(duration);
  var minutes = Math.floor(totalSeconds / 60);
  var seconds = totalSeconds % 60;
  var minuteUnit = lang === 'ru' ? 'м' : 'm';
  var secondUnit = lang === 'ru' ? 'с' : 's';
  if (!minutes) return seconds + secondUnit;
  return minutes + minuteUnit + (seconds ? ' ' + seconds + secondUnit : '');
}

// Запоминаем верхний слой ДО обработчиков Fancybox: он может удалить свой
// DOM при закрытии. Этот же клик/Escape не должен закрывать лежащий ниже кейс.
['click', 'keydown'].forEach(function(type) {
  document.addEventListener(type, function(event) {
    event.fromMediaViewer = !!document.querySelector('.fancybox__container') ||
      event.composedPath().some(function(node) { return node.classList?.contains('fancybox__container'); });
  }, true);
});

// Приветственная GIF и видео о себе: каждый запуск начинается заново.
(function () {
  var avatar = document.getElementById('avatar');
  var dialog = document.getElementById('aboutVideoDialog');
  var video = document.getElementById('aboutVideo');
  var duration = document.getElementById('avatarDuration');
  var time = document.getElementById('avatarTime');

  function updateVideoDuration() {
    duration.setAttribute('data-en', formatVideoDuration(video.duration, 'en'));
    duration.setAttribute('data-ru', formatVideoDuration(video.duration, 'ru'));
    duration.textContent = duration.getAttribute('data-' + document.documentElement.lang);
    time.hidden = !duration.textContent;
  }
  video.addEventListener('loadedmetadata', updateVideoDuration);
  video.addEventListener('durationchange', updateVideoDuration);
  video.addEventListener('emptied', updateVideoDuration);
  updateVideoDuration();

  avatar.addEventListener('click', function (event) {
    uiSounds?.playUISound('tap'); event.uiSoundHandled = true;
    dialog.show();
    video.currentTime = 0;
    video.muted = false;
    video.play().catch(function () {});
  });

  dialog.querySelector('.about-video__close').addEventListener('click', function (event) {
    uiSounds?.playUISound('press'); event.uiSoundHandled = true;
    dialog.close();
  });
  document.addEventListener('click', function (event) {
    if (!event.fromMediaViewer && dialog.open && (event.target === dialog || !dialog.contains(event.target)) && !avatar.contains(event.target)) {
      if (!event.uiSoundHandled && !event.target.closest('a, button')) {
        uiSounds?.playUISound('press'); event.uiSoundHandled = true;
      }
      dialog.close();
    }
  });
  document.addEventListener('keydown', function (event) {
    if (!event.fromMediaViewer && dialog.open && event.key === 'Escape') {
      if (!event.defaultPrevented) uiSounds?.playUISound('press');
      event.preventDefault();
      dialog.close();
    }
  });
  video.addEventListener('ended', function () { dialog.close(); });
  dialog.addEventListener('close', function () {
    video.pause();
    video.currentTime = 0;
    if (dialog.contains(document.activeElement)) avatar.focus({ preventScroll: true });
  });
})();

// Scroll to Top
function scrollToTop(event) {
  uiSounds?.playUISound('click');
  if (event) event.uiSoundHandled = true;
  closeMobileMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// На мобильных меню раскрывается поверх страницы, не сдвигая контент.
var mobileNav = document.querySelector('.fixed-nav');
var menuToggle = document.getElementById('menuToggle');
function closeMobileMenu(returnFocus) {
  mobileNav.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  if (returnFocus) menuToggle.focus({ preventScroll: true });
}
menuToggle.addEventListener('click', function(event) {
  uiSounds?.playUISound('toggle'); event.uiSoundHandled = true;
  var open = mobileNav.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', function(event) {
  if (!mobileNav.contains(event.target)) closeMobileMenu();
});
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && mobileNav.classList.contains('is-open')) {
    closeMobileMenu(true);
  }
});
mobileNav.addEventListener('focusout', function(event) {
  if (!mobileNav.contains(event.relatedTarget)) closeMobileMenu();
});
window.matchMedia('(max-width: 1024px)').addEventListener('change', function() {
  closeMobileMenu();
});

// Навигация по секциям.
// Обрабатываем клик сами, а не полагаемся на переход по якорю: нативный
// переход не срабатывает при программном клике (например, в превью внутри
// iframe). Прокрутку выполняем через window.scrollTo — плавность даёт
// CSS-свойство html { scroll-behavior: smooth }.
function scrollToSection(id) {
  var target = document.getElementById(id);
  if (!target) return;

  var headerOffset = 0;
  if (window.matchMedia('(max-width: 1024px)').matches) {
    var header = document.querySelector('.site-header');
    var headerStyle = getComputedStyle(header);
    // Первая строка grid — постоянная высота шапки из CSS-токенов.
    // Вторая строка — меню: во время сворачивания её высоту не учитываем.
    headerOffset = header.getBoundingClientRect().top
      + parseFloat(headerStyle.gridTemplateRows)
      + parseFloat(headerStyle.borderTopWidth)
      + parseFloat(headerStyle.borderBottomWidth);
  }
  // Координата в документе, независимо от offsetParent и отступов body.
  var targetTop = target.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: id === 'hero' ? 0 : Math.max(0, targetTop - headerOffset), behavior: 'smooth' });

  // Сохраняем адрес в строке браузера (в sandbox-iframe может быть запрещено)
  try {
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  } catch (e) {}

  updateActiveNav();
}

// Подсвечиваем пункт меню, которому принадлежит текущая позиция.
// Пробная линия берётся от верха окна: так последняя секция
// подсвечивается и когда страница доскроллена до конца.
function updateActiveNav() {
  var probe = window.scrollY + 150;
  var links = Array.from(document.querySelectorAll('#primaryNavigation a'));
  var targets = links.map(function(link) {
    return document.getElementById(link.getAttribute('href').slice(1));
  }).filter(Boolean).sort(function(a, b) { return a.offsetTop - b.offsetTop; });
  var currentId = null;
  targets.forEach(function(target) { if (probe >= target.offsetTop) currentId = target.id; });
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2 && targets.length) {
    currentId = targets[targets.length - 1].id;
  }
  links.forEach(function(link) {
    link.classList.toggle('active', link.getAttribute('href') === '#' + currentId);
  });
}

document.getElementById('primaryNavigation').addEventListener('click', function(event) {
  var link = event.target.closest('a');
  if (!link) return;
  event.preventDefault();
  uiSounds?.playUISound('click'); event.uiSoundHandled = true;
  closeMobileMenu(mobileNav.classList.contains('is-open'));
  scrollToSection(link.getAttribute('href').slice(1));
});

window.addEventListener('scroll', updateActiveNav);
updateActiveNav();

// Fancybox из прежнего портфолио: изображения и видео в одной галерее.
// Подпись читается при открытии, поэтому соответствует текущему RU/EN.
var galleryBound = false;
function bindGallery() {
  if (!window.Fancybox || galleryBound) return;
  galleryBound = true;
  var galleryOptions = {
    // Штатные лупа и крестик; стрелки остаются только у галереи.
    Toolbar: { display: { left: [], middle: [], right: ['toggleZoom', 'close'] } },
    Thumbs: false,
    compact: false,
    backdropClick: 'close',
    contentClick: 'toggleZoom',
    Hash: false,
    placeFocusBack: false,
    // Эти параметры относятся только к просмотрщику артефактов, не к статьям кейсов.
    Html: {
      videoAutoplay: true,
      videoTpl: '<video class="fancybox__html5video artifact-viewer-video" muted autoplay loop playsinline poster="{{poster}}"><source src="{{src}}" type="{{format}}"></video>'
    },
    caption: function(instance, slide) {
      var figure = slide.triggerEl && slide.triggerEl.closest('figure');
      // Текстовая подпись, без интерпретации Markdown-текста как HTML.
      var caption = document.createElement('span');
      caption.textContent = figure?.querySelector('figcaption')?.textContent || '';
      return caption.innerHTML;
    },
    l10n: document.documentElement.lang === 'ru' ? {
      CLOSE: 'Закрыть', NEXT: 'Следующая работа', PREV: 'Предыдущая работа',
      MODAL: 'Просмотр работ', ERROR: 'Не удалось загрузить работу'
    } : { CLOSE: 'Close', NEXT: 'Next work', PREV: 'Previous work', MODAL: 'Work viewer' },
    on: {
      init: function(instance) {
        uiSounds?.playUISound('tap');
        instance.returnScrollY = window.scrollY;
        var caseBody = document.querySelector('#caseDialog .case-modal__body');
        instance.returnCaseScrollTop = caseBody?.scrollTop;
        document.querySelectorAll('video[data-site-preview]').forEach(function(video) { video.pause(); });
        var ru = document.documentElement.lang === 'ru';
        instance.options.l10n = Object.assign({}, instance.options.l10n, {
          CLOSE: ru ? 'Закрыть' : 'Close', NEXT: ru ? 'Следующая работа' : 'Next work',
          PREV: ru ? 'Предыдущая работа' : 'Previous work', MODAL: ru ? 'Просмотр работ' : 'Work viewer'
        });
      },
      close: function() {
        uiSounds?.playUISound('press');
      },
      destroy: function(instance) {
        // Возвращаем фокус без прокрутки: на мобильных закрытие свайпом
        // не должно переносить страницу к началу или к другой миниатюре.
        requestAnimationFrame(function() {
          window.scrollTo({ top: instance.returnScrollY, behavior: 'instant' });
          var caseBody = document.querySelector('#caseDialog[open] .case-modal__body');
          if (caseBody && instance.returnCaseScrollTop != null) caseBody.scrollTop = instance.returnCaseScrollTop;
          var trigger = instance.options.triggerEl;
          if (trigger) trigger.focus({ preventScroll: true });
          document.dispatchEvent(new Event('gallery-viewer-close'));
        });
      }
    }
  };
  Fancybox.bind('[data-fancybox="artifacts"]', galleryOptions);
  // Одиночные фотографии кейсов и about не имеют навигации между слайдами.
  Fancybox.bind('[data-fancybox^="case-image-"], [data-fancybox="about-photo"]', Object.assign({}, galleryOptions, {
    Carousel: { infinite: false, Navigation: false }
  }));
}

// Статические кнопки шапки и возврата наверх.
document.querySelector('.fixed-nav .logo').addEventListener('click', scrollToTop);
document.getElementById('backToTop').addEventListener('click', scrollToTop);
document.getElementById('themeBtn').addEventListener('click', function(event) {
  uiSounds?.playUISound('toggle'); event.uiSoundHandled = true;
  toggleTheme();
});
document.querySelectorAll('.lang-btn').forEach(function(button) {
  button.addEventListener('click', function(event) {
    if (document.documentElement.lang !== button.dataset.lang) uiSounds?.playUISound('select');
    event.uiSoundHandled = true;
    setLang(button.dataset.lang);
  });
});

// Загрузка просмотрщика не блокирует Markdown и основные элементы сайта.
document.addEventListener('load', function(event) {
  if (event.target.id === 'galleryLibrary') bindGallery();
}, true);
bindGallery();

// Стили внешнего просмотрщика также не задерживают выполнение CMS.
var galleryStyles = document.createElement('link');
galleryStyles.rel = 'stylesheet';
galleryStyles.href = 'https://cdn.jsdelivr.net/npm/@fancyapps/ui@5.0.36/dist/fancybox/fancybox.css';
document.head.append(galleryStyles);

// Только mailto-ссылки: копируем адрес без темы письма и других параметров.
var toastLabels = {
  'Скопировано': { ru: 'Скопировано в буфер обмена', en: 'Copied to clipboard' },
  'Ошибка копирования': { ru: 'Не удалось скопировать адрес', en: 'Could not copy the email address' }
};
var toastKey = null, toastTimer, toastHideTimer;
function updateToastLabel() {
  if (!toastKey) return;
  var value = toastLabels[toastKey];
  document.querySelector('#siteToast .toast__message').textContent = value[document.documentElement.lang === 'en' ? 'en' : 'ru'];
}
function configureToast(values) {
  Object.keys(toastLabels).forEach(function(key) { if (values[key]) toastLabels[key] = values[key]; });
  updateToastLabel();
}
function showToast(failed) {
  var toast = document.getElementById('siteToast');
  clearTimeout(toastTimer); clearTimeout(toastHideTimer);
  toastKey = failed ? 'Ошибка копирования' : 'Скопировано';
  toast.dataset.kind = failed ? 'error' : 'success';
  toast.querySelector('.icon').className = 'icon ' + (failed ? 'icon--close' : 'icon--check');
  updateToastLabel();
  toast.hidden = false;
  toast.getBoundingClientRect();
  toast.classList.add('is-visible');
  var duration = parseFloat(getComputedStyle(toast).getPropertyValue('--toast-display-duration')) || 3000;
  toastTimer = setTimeout(function() {
    toast.classList.remove('is-visible');
    toastHideTimer = setTimeout(function() { toast.hidden = true; }, 180);
  }, duration);
}
async function copyEmail(address) {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(address);
  } catch (error) {
    // Резерв для браузеров без Clipboard API или без разрешения на него.
    var field = document.createElement('textarea');
    var focused = document.activeElement;
    field.value = address; field.readOnly = true;
    field.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.append(field); field.select();
    var copied = false;
    try { copied = document.execCommand('copy'); }
    finally { field.remove(); if (focused?.isConnected) focused.focus({ preventScroll: true }); }
    if (!copied) throw error;
  }
}
document.addEventListener('click', async function(event) {
  var anchor = event.target.closest('a[href]');
  if (!anchor || !/^mailto:/i.test(anchor.getAttribute('href'))) return;
  event.preventDefault();
  try {
    var address = decodeURIComponent(anchor.getAttribute('href').replace(/^mailto:/i, '').split('?')[0]);
    if (!address) throw new Error('Empty email');
    await copyEmail(address);
    uiSounds?.playUISound('click');
    showToast(false);
  } catch (error) { showToast(true); }
});
document.addEventListener('languagechange', updateToastLabel);

// Обычные ссылки, в том числе созданные из Markdown. Специальные действия
// озвучиваются в собственных обработчиках, чтобы на один клик был один звук.
document.addEventListener('click', function(event) {
  var anchor = event.target.closest('a[href]');
  if (!anchor || event.fromMediaViewer || event.uiSoundHandled || event.defaultPrevented ||
      anchor.matches('[data-open-case], [data-fancybox], [aria-disabled="true"]') ||
      anchor.closest('.fancybox__container') || /^mailto:/i.test(anchor.getAttribute('href'))) return;
  var primary = anchor.matches('#telegramCTA, #cvCTA, #headerContactCTA, #headerCvCTA, .work-item__frame, .work-title');
  uiSounds?.playUISound(primary ? 'tap' : 'click');
  event.uiSoundHandled = true;
});

// CTA появляются, когда hero полностью прошёл под верхней границей окна.
var headerActions = document.getElementById('headerActions');
var headerHero = document.getElementById('hero');
function updateHeaderActions() {
  var visible = !headerHero.hasAttribute('data-cms-pending') && window.matchMedia('(max-width: 1024px)').matches && headerHero.getBoundingClientRect().bottom <= 0;
  headerActions.hidden = !visible;
}
var headerFrame = 0;
window.addEventListener('scroll', function() {
  if (!headerFrame) headerFrame = requestAnimationFrame(function() { headerFrame = 0; updateHeaderActions(); });
}, { passive: true });
window.addEventListener('resize', updateHeaderActions);
new ResizeObserver(updateHeaderActions).observe(headerHero);
updateHeaderActions();
