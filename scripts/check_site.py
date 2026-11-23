#!/usr/bin/env python3
"""Проверки сайта перед публикацией: битые ссылки и известные ловушки.

Запускается локально и в GitHub Actions. Ненулевой код возврата означает,
что публиковать нельзя.
"""

import json
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = ['index.html', '404.html']
EXTERNAL = ('http://', 'https://', 'mailto:', 'tel:', '#', 'data:', '//')
MEDIA = re.compile(r'\.(?:jpe?g|png|gif|svg|webp|mp4|webm|pdf|ico|woff2?)$', re.I)

errors = []


def fail(message):
    errors.append(message)


def local_path(raw):
    """Путь из ссылки: без query, якоря и URL-кодирования."""
    return urllib.parse.unquote(raw.split('?')[0].split('#')[0])


def check_html():
    for name in HTML_FILES:
        path = ROOT / name
        if not path.exists():
            fail(f'{name}: файл не найден')
            continue
        html = path.read_text(encoding='utf-8')

        for match in re.finditer(r'(?:src|href)="([^"]+)"', html):
            ref = match.group(1).strip()
            if not ref or ref.startswith(EXTERNAL):
                continue
            target = (ROOT / local_path(ref))
            if not target.exists():
                fail(f'{name}: битая ссылка {ref}')

        # Один h1 на страницу. Внутри <noscript> заголовок живёт отдельно.
        visible = re.sub(r'<noscript>.*?</noscript>', '', html, flags=re.S | re.I)
        h1 = len(re.findall(r'<h1\b', visible, re.I))
        if h1 > 1:
            fail(f'{name}: заголовков h1 больше одного ({h1})')

        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
            try:
                json.loads(block)
            except json.JSONDecodeError as error:
                fail(f'{name}: JSON-LD не разбирается — {error}')

        if 'rel="icon"' in html and re.search(r'rel="icon"\s*/>', html):
            fail(f'{name}: у rel="icon" нет href — иконку не увидят краулеры')


def check_styles():
    for path in sorted((ROOT / 'css').glob('*.css')):
        text = path.read_text(encoding='utf-8')
        # В WebKit это свойство ломает сопоставление вариативных шрифтов.
        for match in re.finditer(r'^\s*text-rendering\s*:\s*optimizeLegibility', text, re.M):
            line = text[:match.start()].count('\n') + 1
            fail(f'{path.name}:{line}: text-rendering: optimizeLegibility запрещён (ломает шрифты в Safari)')
        if re.search(r'url\([^)]*\.webp', text, re.I):
            fail(f'{path.name}: ссылка на WebP — этот формат в проекте не используется')


def check_content():
    site = ROOT / 'site.md'
    if not site.exists():
        fail('site.md: файл не найден')
        return
    text = site.read_text(encoding='utf-8')

    # Пути к медиа в таблицах site.md.
    for match in re.finditer(r'\|\s*((?:assets|cases)/[^|\s]+)\s*\|', text):
        ref = local_path(match.group(1))
        if MEDIA.search(ref) and not (ROOT / ref).exists():
            fail(f'site.md: файл не найден — {ref}')

    # Карточка — мини-сторителлинг: не больше шести картинок вместе с обложкой.
    for block in re.split(r'(?m)^### Кейс: ', text)[1:]:
        name = block.splitlines()[0].strip()
        gallery = re.search(
            r'(?m)^\| Медиа \| Подпись RU \| Подпись EN \| Ширина \|[^\n]*\n\|[^\n]*\|\n((?:\|[^\n]*\n?)*)',
            block,
        )
        if not gallery:
            continue
        frames = [line for line in gallery.group(1).splitlines() if line.startswith('|')]
        if len(frames) > 6:
            fail(f'site.md: кейс «{name}»: картинок {len(frames)}, максимум 6 вместе с обложкой')

    # Статьи кейсов: ссылки внутри md считаются от папки статьи.
    for article in sorted(ROOT.glob('cases/*/*.md')):
        body = article.read_text(encoding='utf-8')
        base = article.parent
        refs = re.findall(r'!\[[^\]]*\]\(([^)\s]+)', body)
        refs += re.findall(r'<video[^>]+src="([^"]+)"', body)
        for ref in refs:
            if ref.startswith(EXTERNAL):
                continue
            if not (base / local_path(ref)).exists():
                fail(f'{article.relative_to(ROOT)}: файл не найден — {ref}')

        # Каждая статья должна быть привязана к карточке в site.md.
        if article.name not in text:
            fail(f'{article.relative_to(ROOT)}: статья не упомянута в site.md')


def check_sections():
    """Раздел site.md должен быть уникальным: дубль ломает разбор всего контента."""
    site = ROOT / 'site.md'
    if not site.exists():
        return
    text = site.read_text(encoding='utf-8')
    for pattern, label in ((r'^## (.+)$', 'раздел'), (r'^### ((?:Кейс|Архив): .+)$', 'карточка')):
        names = [str(m).strip() for m in re.findall(pattern, text, re.M)]
        for name in sorted(set(names)):
            if names.count(name) > 1:
                fail(f'site.md: {label} «{name}» объявлен {names.count(name)} раза')



def check_glyphs():
    """Символы, которых нет в шрифтах сайта, браузер дорисовывает чужим шрифтом.

    Пример: неразрывный дефис U+2011 в Geist Mono отсутствует — «тг‑канал»
    на первом экране выглядел сломанным.
    """
    missing = {
        # U+2011 разрешён: неразрывный дефис держит слово целиком, браузер
        # берёт глиф из соседнего шрифта, визуально это обычный дефис.
        0x2060: 'склейщик слов U+2060 (попадает в текст при копировании и парсинге)',
    }
    files = [ROOT / 'site.md'] + sorted(ROOT.glob('cases/*/*.md'))
    for path in files:
        text = path.read_text(encoding='utf-8')
        for code, label in missing.items():
            if chr(code) in text:
                fail(f'{path.relative_to(ROOT)}: {label}')



def check_audio_manifest():
    """Каждое видео должно быть в манифесте: иначе автоплей решится неверно."""
    manifest_path = ROOT / 'assets' / 'video' / 'audio-manifest.json'
    if not manifest_path.exists():
        fail('assets/video/audio-manifest.json: файла нет, запустите build_index.py')
        return
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as error:
        fail(f'audio-manifest.json не разбирается — {error}')
        return
    videos = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'assets').rglob('*')
              if p.suffix.lower() in {'.mp4', '.webm'}}
    videos |= {p.relative_to(ROOT).as_posix() for p in (ROOT / 'cases').rglob('*')
               if p.suffix.lower() in {'.mp4', '.webm'}}
    for video in sorted(videos - set(manifest)):
        fail(f'{video}: нет в audio-manifest.json — запустите build_index.py')


def main():
    check_html()
    check_styles()
    check_content()
    check_sections()
    check_glyphs()
    check_audio_manifest()

    if errors:
        print(f'Проверка не пройдена, проблем: {len(errors)}\n')
        for error in errors:
            print(f'  • {error}')
        return 1

    print('Проверка пройдена: ссылки целы, разметка и стили без известных ловушек.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
