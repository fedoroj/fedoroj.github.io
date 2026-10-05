/* personal portfolio — theme + language switcher */
(function () {
    'use strict';

    var THEME_KEY = 'portfolio-theme';
    var LANG_KEY = 'portfolio-lang';

    /* ---------- i18n dictionary ---------- */
    var translations = {
        ru: {
            'header.name': 'сергей фёдоров',
            'hero.title': 'сергей фёдоров — продуктовый дизайнер',
            'hero.subheader': 'проектирую интерфейсы для веб и мобильных продуктов: от исследования и прототипа до дизайн-системы и поддержки релиза. 6 лет в дизайне, считаю, что думать своей головой важнее, чем следовать фреймворку.',
            'hero.cta': 'обсудить проект',
            'hero.cv': 'скачать cv',
            'works.title': 'избранные работы',
            'works.natali-app.title': 'маркетплейс «natali» — мобильное приложение',
            'works.natali-app.status': 'в процессе',
            'works.natali-app.1': 'редизайн мобильного приложения (ios & android)',
            'works.natali-app.2': 'разработка дизайн-системы',
            'works.natali-app.3': 'дизайн-поддержка сервиса',
            'works.natali-app.4': '100 000+ установок в google play',
            'works.natali-app.5': '100 000+ установок в app store',
            'works.natali-web.title': 'маркетплейс «natali» — веб-версия',
            'works.natali-web.1': 'редизайн веб-версии маркетплейса (desktop, tablet, mobile)',
            'works.natali-web.2': 'дизайн-поддержка сервиса',
            'works.natali-web.3': 'разработка дизайн-системы',
            'works.natali-web.4': '50 000+ посетителей сайта в месяц',
            'works.drozzi.title': '«дрожжи» — маркетинговое агентство',
            'works.drozzi.status': 'в процессе',
            'works.drozzi.1': 'разработка дизайна сайта',
            'works.drozzi.2': 'десктопная и мобильная версии',
            'works.behance.title': 'проекты на behance',
            'works.behance.1': '«legion» — лого для хоккейного клуба',
            'works.behance.2': '«деловая женщина» — информационный портал',
            'works.dribbble.title': 'шоты на dribbble',
            'works.dribbble.1': 'paul rand concept design',
            'works.dribbble.2': 'paul rand concept design (02)',
            'works.dribbble.3': 'и многие другие',
            'about.title': 'о себе',
            'about.p1': 'сергей фёдоров, продуктовый дизайнер. начинал с графики в типографии, вырос до редизайна маркетплейсов с шестизначной аудиторией. методологии — не аксиома, панацея важна своя голова.',
            'about.p2': 'умею рисовать иконки, собирать дизайн-системы и доводить интерфейсы до релиза. английский — рабочий, русский — родной.',
            'about.skills.title': 'скиллы:',
            'about.skills.1': 'figma, figjam',
            'about.skills.2': 'photoshop, illustrator',
            'about.skills.3': 'after effects, blender 3d',
            'about.skills.4': 'html, css',
            'about.skills.5': 'webflow, tilda, readymag',
            'about.skills.6': 'notion, miro',
            'career.title': 'карьера:',
            'career.1.time': '2020 → сейчас',
            'career.1.text': '«дрожжи» — маркетинговое агентство. старший дизайнер',
            'career.2.time': '2018 → 2019',
            'career.2.text': 'типография x-press. графический дизайнер',
            'career.3.time': '2018',
            'career.3.text': 'россфера. веб-дизайнер',
            'career.4.time': '2014',
            'career.4.text': 'первые шаги в дизайне',
            'contacts.title': 'контакты',
            'contacts.intro': 'открыт к новым проектам и консультациям. отвечаю в течение суток.',
            'contacts.email': 'e-mail',
            'contacts.telegram': 'telegram',
            'contacts.behance': 'behance',
            'contacts.dribbble': 'dribbble',
            'contacts.instagram': 'instagram',
            'contacts.note': 'телефон и zoom — по запросу',
            'footer.copy': '©2022–2026 · сергей фёдоров · v2.0',
            'lang.toggle': 'switch to english'
        },
        en: {
            'header.name': 'sergey fedorov',
            'hero.title': 'sergey fedorov — product designer',
            'hero.subheader': 'i design interfaces for web and mobile products: from research and prototypes to design systems and release support. 6 years in design, i believe thinking for yourself matters more than following a framework.',
            'hero.cta': 'discuss a project',
            'hero.cv': 'download cv',
            'works.title': 'selected works',
            'works.natali-app.title': 'natali marketplace — mobile app',
            'works.natali-app.status': 'in progress',
            'works.natali-app.1': 'mobile app redesign (ios & android)',
            'works.natali-app.2': 'design system development',
            'works.natali-app.3': 'ongoing design support',
            'works.natali-app.4': '100,000+ installs on google play',
            'works.natali-app.5': '100,000+ installs on app store',
            'works.natali-web.title': 'natali marketplace — web version',
            'works.natali-web.1': 'web marketplace redesign (desktop, tablet, mobile)',
            'works.natali-web.2': 'ongoing design support',
            'works.natali-web.3': 'design system development',
            'works.natali-web.4': '50,000+ monthly visitors',
            'works.drozzi.title': 'drozzi — marketing agency',
            'works.drozzi.status': 'in progress',
            'works.drozzi.1': 'website design',
            'works.drozzi.2': 'desktop and mobile versions',
            'works.behance.title': 'behance projects',
            'works.behance.1': '“legion” — ice hockey logo design',
            'works.behance.2': '“business woman” — information portal',
            'works.dribbble.title': 'dribbble shots',
            'works.dribbble.1': 'paul rand concept design',
            'works.dribbble.2': 'paul rand concept design (02)',
            'works.dribbble.3': 'and many more',
            'about.title': 'about',
            'about.p1': 'sergey fedorov, product designer. started with print graphics at a typography shop, grew into redesigning marketplaces with six-figure audiences. methodologies are not axioms — thinking for yourself matters most.',
            'about.p2': 'i draw icons, build design systems and ship interfaces to production. english — working level, russian — native.',
            'about.skills.title': 'skills:',
            'about.skills.1': 'figma, figjam',
            'about.skills.2': 'photoshop, illustrator',
            'about.skills.3': 'after effects, blender 3d',
            'about.skills.4': 'html, css',
            'about.skills.5': 'webflow, tilda, readymag',
            'about.skills.6': 'notion, miro',
            'career.title': 'career:',
            'career.1.time': '2020 → now',
            'career.1.text': 'drozzi — marketing agency. senior designer',
            'career.2.time': '2018 → 2019',
            'career.2.text': 'x-press typography. graphic designer',
            'career.3.time': '2018',
            'career.3.text': 'rossfera. web designer',
            'career.4.time': '2014',
            'career.4.text': 'first steps in design',
            'contacts.title': 'contacts',
            'contacts.intro': 'open to new projects and consultations. i reply within a day.',
            'contacts.email': 'e-mail',
            'contacts.telegram': 'telegram',
            'contacts.behance': 'behance',
            'contacts.dribbble': 'dribbble',
            'contacts.instagram': 'instagram',
            'contacts.note': 'phone and zoom — on request',
            'footer.copy': '©2022–2026 · sergey fedorov · v2.0',
            'lang.toggle': 'переключить на русский'
        }
    };

    /* ---------- helpers ---------- */
    function store(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }

    function read(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    /* ---------- theme ---------- */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        var btn = document.getElementById('theme-toggle');
        if (btn) {
            var label = theme === 'dark' ? 'switch to light theme' : 'switch to dark theme';
            btn.setAttribute('aria-label', label);
            btn.setAttribute('title', label);
        }
    }

    function initTheme() {
        var saved = read(THEME_KEY);
        var prefersDark = window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(saved || (prefersDark ? 'dark' : 'light'));
    }

    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme') === 'dark'
            ? 'dark' : 'light';
        var next = current === 'dark' ? 'light' : 'dark';
        store(THEME_KEY, next);
        applyTheme(next);
    }

    /* ---------- language ---------- */
    function applyLang(lang) {
        var dict = translations[lang] || translations.ru;
        document.documentElement.setAttribute('lang', lang);
        document.documentElement.setAttribute('data-lang', lang);

        var nodes = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < nodes.length; i++) {
            var key = nodes[i].getAttribute('data-i18n');
            if (dict[key] !== undefined) {
                nodes[i].textContent = dict[key];
            }
        }

        var titleEl = document.getElementById('page-title');
        if (titleEl) {
            titleEl.textContent = lang === 'en'
                ? 'sergey fedorov — product designer'
                : 'сергей фёдоров — продуктовый дизайнер';
        }

        var langBtn = document.getElementById('lang-toggle');
        if (langBtn) {
            langBtn.setAttribute('aria-label', dict['lang.toggle']);
            langBtn.setAttribute('title', dict['lang.toggle']);
        }
    }

    function initLang() {
        var saved = read(LANG_KEY);
        var guess = navigator.language && navigator.language.indexOf('ru') === 0 ? 'ru' : 'en';
        applyLang(saved || guess);
    }

    function toggleLang() {
        var current = document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'ru';
        var next = current === 'en' ? 'ru' : 'en';
        store(LANG_KEY, next);
        applyLang(next);
    }

    /* ---------- boot ---------- */
    initTheme(); /* run early to avoid flash of wrong theme */

    document.addEventListener('DOMContentLoaded', function () {
        initLang();
        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
        document.getElementById('lang-toggle').addEventListener('click', toggleLang);
    });
})();
