/* Тема по местному времени посетителя, без запроса часового пояса.
   07:00–20:59 — светлая; 21:00–06:59 — тёмная.
   Ручной выбор хранится только в этой вкладке, включая перезагрузку страницы.
   Скрипт подключён в начале body, до содержимого первого экрана. */
var themeStorageKey = 'serge-portfolio-tab-theme';

function resolveTheme(hour, savedTheme) {
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return hour >= 7 && hour < 21 ? 'light' : 'dark';
}

(function initializeTheme() {
  var savedTheme = null;
  try { savedTheme = sessionStorage.getItem(themeStorageKey); } catch (error) {}
  document.body.setAttribute('data-theme', resolveTheme(new Date().getHours(), savedTheme));
})();

function updateThemeControl() {
  var button = document.getElementById('themeBtn');
  if (!button) return;
  var dark = document.body.getAttribute('data-theme') === 'dark';
  var en = document.documentElement.lang === 'en';
  var label = en
    ? (dark ? 'Switch to light theme' : 'Switch to dark theme')
    : (dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  button.setAttribute('aria-label', label);
  button.title = label;
}
document.addEventListener('DOMContentLoaded', updateThemeControl);
document.addEventListener('languagechange', updateThemeControl);

function toggleTheme() {
  var body = document.body;
  var current = body.getAttribute('data-theme');
  var next = current === 'light' ? 'dark' : 'light';
  body.setAttribute('data-theme', next);
  updateThemeControl();
  try { sessionStorage.setItem(themeStorageKey, next); } catch (error) {}
  // Завершаем только переходы оформления в этом кадре. Zoom, движение toast
  // и пульсация статуса продолжаются; следующий hover снова использует свои 750ms.
  body.getAnimations({ subtree: true }).forEach(function(animation) {
    if ('transitionProperty' in animation && /color|background|border|shadow|fill|stroke|filter/.test(animation.transitionProperty)) {
      animation.finish();
    }
  });
}
