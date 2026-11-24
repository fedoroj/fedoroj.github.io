#!/usr/bin/env python3
"""Обновляет версии CSS и JS в основном index.html без пересборки разметки.

Разметка: index.html. Стили: css/*.css. Логика: js/*.js.
После их изменения: python3 build_index.py.
Контент site.md и cases/ читается сайтом напрямую, без пересборки.
При публикации сохраняйте рядом с index.html папки css, js, assets и cases,
а также site.md. Встроенные base64-ресурсы больше не используются.
"""

import hashlib
from html import escape
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Ресурсы, к URL которых добавляется версия содержимого.
ASSET_PATTERN = (r'(href|src)="((?:css|js|assets/vendor)/[^"?]+\.(?:css|js)'
                 r'|assets/fonts/[^"?]+\.woff2)(?:\?v=[a-f0-9]+)?"')


def content_lastmod():
    """Дата последнего изменения контента (site.md или cases/) по git.

    Нужна для lastmod в sitemap.xml: поисковик считает страницу свежей
    только когда дата растёт. Берём дату коммита, а не текущее время,
    иначе файл менялся бы при каждой сборке без изменений в тексте.
    """
    try:
        result = subprocess.run(
            ['git', 'log', '-1', '--format=%cs', '--', 'site.md', 'cases'],
            cwd=ROOT, capture_output=True, text=True, check=True,
        )
        value = result.stdout.strip()
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            return value
    except (OSError, subprocess.CalledProcessError):
        pass
    return None


VIDEO_EXTENSIONS = {'.mp4', '.webm'}
# Размеры нужны заглушкам: скелетон картинки совпадает с её пропорциями.
MEDIA_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm'}


def media_size(path):
    """Ширина и высота файла: из них строится заглушка до загрузки."""
    measured = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
         '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', str(path)],
        capture_output=True, text=True,
    )
    try:
        width, height = (measured.stdout or '').strip().split('x')[:2]
        return {'width': int(width), 'height': int(height)}
    except ValueError:
        return {}


def video_info(path):
    """Звуковая дорожка, длительность и размер ролика.

    Наличие дорожки решает, включать ли автоплей, длительность показывает
    кнопка «видео о себе» без загрузки файла, размер задаёт пропорции заглушки.
    Громкость не оценивается.
    """
    streams = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'a',
         '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', str(path)],
        capture_output=True, text=True,
    )
    measured = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', str(path)],
        capture_output=True, text=True,
    )
    try:
        seconds = round(float((measured.stdout or '').strip()), 1)
    except ValueError:
        seconds = None
    return {'audio': 'audio' in (streams.stdout or ''), 'duration': seconds, **media_size(path)}


def video_poster(video):
    """Первый кадр ролика рядом с файлом: <имя>-poster.jpg.

    Показывается вместо видео, пока до него не доскроллили, поэтому сама
    карточка не тянет мегабайты. Если файл уже есть, не перезаписываем.
    """
    poster = video.with_name(f'{video.stem}-poster.jpg')
    if poster.exists() or not shutil.which('ffmpeg'):
        return
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-ss', '0', '-i', str(video),
         '-frames:v', '1', '-vf', "scale='min(960,iw)':-2", '-q:v', '5', str(poster)],
        capture_output=True,
    )


def update_audio_manifest():
    """Пишет assets/video/audio-manifest.json: звук, длительность и постеры.

    По нему сайт решает, включать ли автопроигрывание (беззвучные играют сами,
    со звуком — только по действию пользователя), какую длительность показать
    у аватарки и какой первый кадр ставить заглушкой. Новые видео попадают
    в манифест при следующей сборке.
    """
    videos = sorted(
        item for item in (ROOT / 'assets').rglob('*')
        if item.suffix.lower() in VIDEO_EXTENSIONS
    ) + sorted(
        item for item in (ROOT / 'cases').rglob('*')
        if item.suffix.lower() in VIDEO_EXTENSIONS
    )
    media = sorted(
        item for item in list((ROOT / 'assets').rglob('*')) + list((ROOT / 'cases').rglob('*'))
        if item.suffix.lower() in MEDIA_EXTENSIONS and item.is_file()
        and not item.stem.endswith('-poster')
    )
    if not media:
        return
    if not shutil.which('ffprobe'):
        print('ffprobe не найден: манифест медиа не обновлён')
        return

    # Постер нужен только тем роликам, что стоят в карточках: для остальных
    # это лишние файлы в репозитории.
    cards = set(re.findall(
        r'^\|\s*((?:assets|cases)/[^|\s]+\.(?:mp4|webm))\s*\|',
        (ROOT / 'site.md').read_text(encoding='utf-8'), re.I | re.M,
    ))
    data = {}
    for item in media:
        relative = item.relative_to(ROOT).as_posix()
        if item.suffix.lower() in VIDEO_EXTENSIONS:
            if relative in cards:
                video_poster(item)
            data[relative] = video_info(item)
        else:
            # Картинкам достаточно размера: он задаёт пропорции заглушки.
            data[relative] = media_size(item)
    target = ROOT / 'assets' / 'video' / 'audio-manifest.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def update_sitemap():
    """Обновляет lastmod в sitemap.xml, остальное содержимое не трогает."""
    path = ROOT / 'sitemap.xml'
    if not path.exists():
        return
    lastmod = content_lastmod()
    if not lastmod:
        return
    source = path.read_text(encoding='utf-8')
    updated = re.sub(r'<lastmod>[^<]*</lastmod>', f'<lastmod>{lastmod}</lastmod>', source)
    if updated != source:
        path.write_text(updated, encoding='utf-8')


def version_asset(match):
    """Версия содержимого позволяет браузеру обновить изменённый CSS/JS."""
    attribute, relative = match.groups()
    version = hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()[:12]
    return f'{attribute}="{relative}?v={version}"'


def version_font(match):
    """Версия шрифта в url(...) внутри CSS: ../assets/fonts/name.woff2?v=hash."""
    relative = match.group(1)
    path = ROOT / relative.replace('../', '')
    version = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    return f'url("{relative}?v={version}")'


def main():
    output = ROOT / 'index.html'
    html = output.read_text(encoding='utf-8')
    # Боты превью не запускают JS: Open Graph должен быть в исходном HTML.
    content = (ROOT / 'site.md').read_text(encoding='utf-8')
    settings_section = content.split('## Настройки вкладки', 1)[1].split('\n## ', 1)[0]
    settings = {}
    for line in settings_section.splitlines():
        if line.startswith('|'):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if len(cells) >= 2:
                settings[cells[0]] = cells[1]
    site_url = settings.get('Site URL', '')
    # Пути og:image и twitter:image редактируются вручную в index.html вне этого блока.
    metadata = [('property', 'og:type', 'website'),
                ('property', 'og:title', settings.get('Title', '')),
                ('property', 'og:url', site_url),
                ('name', 'twitter:card', 'summary_large_image'),
                ('name', 'twitter:title', settings.get('Title', ''))]
    block = '    <!-- Open Graph: generated from site.md -->\n'
    block += '\n'.join(f'    <meta {attribute}="{key}" content="{escape(value, quote=True)}" />'
                       for attribute, key, value in metadata if value)
    block += '\n    <!-- /Open Graph -->'
    if '<!-- Open Graph: generated from site.md -->' in html:
        html = re.sub(r'    <!-- Open Graph: generated from site.md -->.*?<!-- /Open Graph -->',
                      lambda _: block, html, flags=re.S)
    else:
        html = html.replace('  </head>', block + '\n  </head>') if '  </head>' in html else html.replace('</head>', block + '\n</head>')
    # Шрифты: Safari на iOS держит их в кэше особенно упорно и при замене файла
    # по тому же адресу продолжает отдавать старую копию (или не отдаёт ничего,
    # и текст падает на системный шрифт). Поэтому версия добавляется в CSS.
    for stylesheet in (ROOT / 'css').glob('*.css'):
        source = stylesheet.read_text(encoding='utf-8')
        updated = re.sub(
            r'url\("(\.\./assets/fonts/[^"?]+\.woff2)(?:\?v=[a-f0-9]+)?"\)',
            version_font,
            source,
        )
        if updated != source:
            stylesheet.write_text(updated, encoding='utf-8')

    html = re.sub(ASSET_PATTERN, version_asset, html)
    output.write_text(html, encoding='utf-8')

    # Вспомогательные страницы (404) используют те же ресурсы, поэтому версии
    # в них обновляются по тому же правилу, иначе они разъедутся с index.html.
    for extra in (ROOT / '404.html',):
        if not extra.exists():
            continue
        source = extra.read_text(encoding='utf-8')
        updated = re.sub(ASSET_PATTERN, version_asset, source)
        if updated != source:
            extra.write_text(updated, encoding='utf-8')
    print(f'Версии ресурсов index.html обновлены: {output.stat().st_size / 1024:.1f} КБ; CSS и JS подключены отдельно.')
    update_sitemap()
    update_audio_manifest()


if __name__ == '__main__':
    main()
