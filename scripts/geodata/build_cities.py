#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Строит расширенный список городов России, Украины и Беларуси (из дампа
GeoNames cities1000 — населённые пункты с населением >= 1000) с русскими
названиями (там, где они есть в GeoNames alternate names), координатами и
IANA-таймзоной, для базы CITIES в site/template.html.

Источники (скачаны в scripts/geodata/):
  cities1000.txt      — сами населённые пункты
  admin1CodesASCII.txt — код региона -> geonameid региона
  RU_alt/RU.txt, UA_alt/UA.txt, BY_alt/BY.txt — alternate names (с языковыми тегами)
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))

COUNTRIES = {
    'RU': {'label': 'Россия', 'alt_file': 'RU_alt/RU.txt', 'lang_priority': ['ru']},
    'UA': {'label': 'Украина', 'alt_file': 'UA_alt/UA.txt', 'lang_priority': ['ru', 'uk']},
    'BY': {'label': 'Беларусь', 'alt_file': 'BY_alt/BY.txt', 'lang_priority': ['ru', 'be']},
}

def load_alt_names(path):
    """geonameid -> {lang: [(name, is_preferred)]}"""
    out = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 4:
                continue
            geonameid = parts[1]
            lang = parts[2]
            name = parts[3]
            is_pref = parts[4] == '1' if len(parts) > 4 else False
            out.setdefault(geonameid, {}).setdefault(lang, []).append((name, is_pref))
    return out

import re
_CYRILLIC_RE = re.compile(r'^[А-ЯЁа-яёІіЇїЄєҐґ\s\-\'\.\d]+$')

def _is_cyrillic(s):
    return bool(_CYRILLIC_RE.match(s))

def best_name(alt_for_id, geonameid, priorities):
    """Некоторые записи в GeoNames помечены языком 'ru'/'uk'/'be', но на
    самом деле содержат латинскую транслитерацию (устаревшие/некорректные
    данные) — поэтому среди кандидатов одного языка сначала предпочитаем
    те, что реально написаны кириллицей."""
    entry = alt_for_id.get(geonameid)
    if not entry:
        return None
    for lang in priorities:
        cands = entry.get(lang)
        if not cands:
            continue
        cyr_pref = [n for n, p in cands if p and _is_cyrillic(n)]
        if cyr_pref:
            return cyr_pref[0]
        cyr_any = [n for n, p in cands if _is_cyrillic(n)]
        if cyr_any:
            return cyr_any[0]
        pref = [n for n, p in cands if p]
        if pref:
            return pref[0]
        return cands[0][0]
    return None

def load_admin1(path):
    """'RU.77' -> (geonameid, english_name)"""
    out = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 4:
                continue
            code, name, ascii_name, geonameid = parts[0], parts[1], parts[2], parts[3]
            out[code] = (geonameid, name)
    return out

admin1 = load_admin1(os.path.join(BASE, 'admin1CodesASCII.txt'))

all_cities = []  # list of dict

for cc, cfg in COUNTRIES.items():
    alt = load_alt_names(os.path.join(BASE, cfg['alt_file']))
    n_total = 0
    n_named = 0
    with open(os.path.join(BASE, 'cities1000.txt'), encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts) < 19:
                continue
            (geonameid, name, asciiname, alternatenames, lat, lon, feat_class, feat_code,
             country, cc2, admin1_code, admin2, admin3, admin4, population, elevation, dem,
             timezone, moddate) = parts[:19]
            if country != cc:
                continue
            # оставляем только самостоятельные населённые пункты и
            # административные центры; исключаем PPLX (район/часть другого
            # города), PPLH/PPLQ (не существующие/заброшенные), PPLL/PPLF
            # (фермы/urochища) — это не отдельные "города"
            if feat_code not in ('PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC'):
                continue
            n_total += 1
            local_name = best_name(alt, geonameid, cfg['lang_priority'])
            if not local_name:
                # запасной путь: ищем кириллический вариант прямо в
                # столбце alternatenames самой строки cities1000 (там
                # иногда есть название, не попавшее в language-dump)
                for cand in alternatenames.split(','):
                    cand = cand.strip()
                    if cand and _is_cyrillic(cand):
                        local_name = cand
                        break
            if not local_name:
                local_name = name
            if local_name != name:
                n_named += 1
            admin1_key = f'{cc}.{admin1_code}'
            region_geonameid, region_en = admin1.get(admin1_key, (None, ''))
            region_name = None
            if region_geonameid:
                region_name = best_name(alt, region_geonameid, cfg['lang_priority'])
            if not region_name:
                region_name = region_en
            all_cities.append({
                'n': local_name,
                'lat': round(float(lat), 4),
                'lon': round(float(lon), 4),
                'tz': timezone,
                'region': region_name or '',
                'pop': int(population) if population else 0,
                'country': cfg['label'],
            })
    print(f'{cc}: {n_total} городов, из них с точным localized-именем: {n_named}')

# сортировка по убыванию населения — крупные города идут первыми и в
# автодополнении, и как приоритет при разрешении дублей имён
all_cities.sort(key=lambda c: -c['pop'])

# --- имена городов из уже существующего в template.html "хвоста" (столицы
# СНГ + крупные мировые города) — их не трогаем; если имя из нашего RU/UA/BY
# датасета совпадает с одним из них (например, есть посёлок «Париж» в
# Челябинской области или «Нью-Йорк» в Донецкой области), помечаем наш
# вариант регионом, чтобы точный поиск по имени не путал маленький посёлок
# со всемирно известным городом ---
tpl_path = os.path.join(BASE, '..', '..', 'site', 'template.html')
existing_tail_names = set()
if os.path.exists(tpl_path):
    with open(tpl_path, encoding='utf-8') as f:
        tpl_src = f.read()
    # только та часть CITIES, что идёт ПОСЛЕ старого RU/UA/BY блока
    # (начинается с Алматы) — сам RU/UA/BY блок будет заменён этим скриптом
    # и не должен участвовать в проверке коллизий сам с собой
    marker = "{ n: 'Алматы'"
    tail_src = tpl_src[tpl_src.index(marker):] if marker in tpl_src else ''
    for m in re.finditer(r"n:\s*'([^']*)'", tail_src):
        existing_tail_names.add(m.group(1))
print(f'Имён в существующем "хвосте" world/CIS городов: {len(existing_tail_names)}')

# --- разрешение дублей имён: если одно и то же имя города встречается
# несколько раз (внутри RU/UA/BY, либо совпадает с существующим мировым
# городом), добавляем к каждому регион в скобках, чтобы автодополнение
# и точный поиск по имени (findCity) однозначно находили нужный город.
# Если регион называется так же, как сам город (например, город
# федерального значения Москва/Санкт-Петербург/Киев/Минск — сам себе
# регион в GeoNames), уточнение регионом бессмысленно и пропускается. ---
from collections import Counter
name_counts = Counter(c['n'] for c in all_cities)
for c in all_cities:
    collides = name_counts[c['n']] > 1 or c['n'] in existing_tail_names
    if collides and c['region'] and c['region'] != c['n']:
        c['display'] = f"{c['n']} ({c['region']})"
    else:
        c['display'] = c['n']

# после добавления региона в скобках возможны повторные коллизии (тот же
# город/регион дублируется в датасете) — на этот случай оставляем только
# первое (более населённое благодаря сортировке) вхождение каждого display-имени
seen = set()
deduped = []
for c in all_cities:
    key = c['display']
    if key in seen:
        continue
    seen.add(key)
    deduped.append(c)

print(f'Итого уникальных городов RU+UA+BY: {len(deduped)}')

# --- сборка JS-фрагмента ---
lines = []
for c in deduped:
    n = json.dumps(c['display'], ensure_ascii=False)
    tz = json.dumps(c['tz'], ensure_ascii=False)
    lines.append(f'{{n:{n},lat:{c["lat"]},lon:{c["lon"]},tz:{tz}}}')

js = ',\n  '.join(lines)
out_path = os.path.join(BASE, 'cities_ru_ua_by.js')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('  ' + js + ',\n')

size_kb = os.path.getsize(out_path) / 1024
print(f'Записано в {out_path}, размер {size_kb:.1f} КБ, {len(deduped)} записей')
