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
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def version_asset(match):
    """Версия содержимого позволяет браузеру обновить изменённый CSS/JS."""
    attribute, relative = match.groups()
    version = hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()[:12]
    return f'{attribute}="{relative}?v={version}"'


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
    html = re.sub(
        r'(href|src)="((?:css|js|assets/vendor)/[^"?]+\.(?:css|js))(?:\?v=[a-f0-9]+)?"',
        version_asset,
        html,
    )
    output.write_text(html, encoding='utf-8')
    print(f'Версии ресурсов index.html обновлены: {output.stat().st_size / 1024:.1f} КБ; CSS и JS подключены отдельно.')


if __name__ == '__main__':
    main()
