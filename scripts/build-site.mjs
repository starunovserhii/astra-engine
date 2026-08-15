#!/usr/bin/env node
/**
 * Собирает docs/../index.html (демо-страница GitHub Pages) из шаблона
 * site/template.html, подставляя актуальные данные примерной карты
 * (считаются заново движком через exportDemo.ts — то есть страница всегда
 * показывает то, что реально считает текущая версия движка, а не
 * зафиксированный снимок).
 *
 * Запуск: npm run build:site
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const dataJson = execSync('npx tsx src/__tests__/exportDemo.ts', { cwd: root, encoding: 'utf-8' });
JSON.parse(dataJson); // валидация, что вывод — корректный JSON, до записи в файл

const template = readFileSync(join(root, 'site', 'template.html'), 'utf-8');
const output = template.replace('/*__ASTRA_DEMO_DATA__*/', dataJson);

writeFileSync(join(root, 'index.html'), output);
console.log(`index.html собран (${output.length} байт), данные: ${dataJson.length} байт JSON.`);
