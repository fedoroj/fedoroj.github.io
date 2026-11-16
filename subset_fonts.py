#!/usr/bin/env python3
"""Обновляет подмножества шрифтов под текущий текст сайта.

Шрифты в assets/fonts урезаны до символов, которые реально встречаются в
site.md, cases/ и разметке. Если добавить новый текст с редкими символами
(другая письменность, спецзнаки), символы начнут подставляться из системного
шрифта. Тогда запустите этот скрипт: он заново соберёт подмножества из
оригиналов.

Оригиналы полных шрифтов лежат вне репозитория, по умолчанию в
~/Desktop/sf-site-portfolio/_fonts-originals. Путь можно передать аргументом:

    python3 subset_fonts.py /путь/к/оригиналам

Требуется fonttools: pip3 install fonttools brotli
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
FONTS = ROOT / 'assets' / 'fonts'
TEXT_EXTENSIONS = {'.md', '.html', '.js', '.css', '.json', '.txt'}

# Диапазоны, которые оставляем всегда: латиница, кириллица, типографика,
# стрелки и валюты. Всё остальное берётся из фактического текста.
BASE_RANGES = [
    (0x0000, 0x00FF), (0x0100, 0x017F), (0x02BB, 0x02BC), (0x02C6, 0x02DA),
    (0x02DC, 0x02DC), (0x0301, 0x0301), (0x0304, 0x0304), (0x0308, 0x0308),
    (0x0329, 0x0329), (0x0400, 0x045F), (0x0490, 0x0491), (0x04B0, 0x04B1),
    (0x2010, 0x2027), (0x2030, 0x203A), (0x20AC, 0x20AC), (0x2116, 0x2116),
    (0x2122, 0x2122), (0x2190, 0x2193), (0x2212, 0x2212), (0x2215, 0x2215),
    (0xFEFF, 0xFEFF),
]


def used_characters():
    chars = set()
    for path in ROOT.rglob('*'):
        if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS and '.git' not in path.parts:
            try:
                chars |= set(path.read_text(encoding='utf-8'))
            except (UnicodeDecodeError, OSError):
                pass
    return {ord(char) for char in chars}


def main():
    originals = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else \
        Path.home() / 'Desktop' / 'sf-site-portfolio' / '_fonts-originals'
    if not originals.is_dir():
        sys.exit(f'Не найдены оригиналы шрифтов: {originals}\n'
                 'Укажите путь аргументом: python3 subset_fonts.py /путь/к/оригиналам')

    used = used_characters()
    codepoints = set(used)
    for start, end in BASE_RANGES:
        codepoints |= set(range(start, end + 1))
    unicodes = ','.join(f'U+{code:04X}' for code in sorted(codepoints))
    print(f'Символов в контенте: {len(used)}, в подмножестве: {len(codepoints)}')

    with tempfile.TemporaryDirectory() as tmp:
        total_before = total_after = 0
        for font in sorted(FONTS.glob('*.woff2')):
            source = originals / font.name
            if not source.exists():
                print(f'пропущен (нет оригинала): {font.name}')
                continue
            target = Path(tmp) / font.name
            result = subprocess.run([
                sys.executable, '-m', 'fontTools.subset', str(source),
                f'--output-file={target}', '--flavor=woff2',
                f'--unicodes={unicodes}', '--layout-features=*', '--name-IDs=*',
                '--recalc-bounds', '--drop-tables+=DSIG', '--passthrough-tables',
            ], capture_output=True, text=True)
            if result.returncode != 0:
                print(f'ОШИБКА {font.name}: {result.stderr.strip()[:200]}')
                continue

            subset = set(TTFont(target).getBestCmap())
            lost = (used & set(TTFont(source).getBestCmap())) - subset
            before, after = font.stat().st_size, target.stat().st_size
            total_before, total_after = total_before + before, total_after + after
            note = '' if not lost else ' ВНИМАНИЕ: потеряны ' + ' '.join(f'U+{c:04X}' for c in sorted(lost))
            print(f'{before / 1024:7.1f} → {after / 1024:6.1f} КБ  {font.name}{note}')
            if after < before and not lost:
                shutil.copyfile(target, font)

    print(f'\nИтого: {total_before / 1024:.0f} КБ → {total_after / 1024:.0f} КБ')
    print('Не забудьте: python3 build_index.py')


if __name__ == '__main__':
    main()
