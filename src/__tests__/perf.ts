/**
 * Замер производительности. Ориентир из конкурентного анализа (Part 1):
 * Chronos "Астропроцессор" заявляет расчёт карты примерно за 0.5с.
 * Задача ASTRA Engine — быть заметно быстрее на современном железе,
 * поскольку вся арифметика — замкнутые формулы/быстрые численные методы,
 * без обращения к внешним сервисам.
 */
import { calculateNatalChart } from '../charts/natal';
import { calculateSynastry } from '../charts/synastry';
import { calculateTransits } from '../charts/transits';
import { EventMoment, HouseSystemId } from '../types';

const location = { latitude: 55.751244, longitude: 37.618423, label: 'Moscow' };
const moment: EventMoment = { utc: new Date(Date.UTC(1990, 5, 15, 8, 30, 0)), timeKnown: true };

function bench(label: string, fn: () => void, iterations: number) {
  // прогрев (JIT)
  for (let i = 0; i < Math.min(5, iterations); i++) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const end = process.hrtime.bigint();
  const totalMs = Number(end - start) / 1e6;
  const perCallMs = totalMs / iterations;
  console.log(`${label}: ${iterations} итераций, ${totalMs.toFixed(1)}мс всего, ${perCallMs.toFixed(3)}мс/расчёт`);
  return perCallMs;
}

console.log('=== ASTRA Engine — замер производительности ===\n');

const systems: HouseSystemId[] = ['placidus', 'wholeSign', 'equal', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitius'];

let natalMs = 0;
for (const sys of systems) {
  natalMs = bench(`Натальная карта (${sys})`, () => {
    calculateNatalChart(moment, location, { houseSystem: sys });
  }, 200);
}

const chartA = calculateNatalChart(moment, location);
const chartB = calculateNatalChart({ utc: new Date(Date.UTC(1988, 2, 3, 14, 10, 0)), timeKnown: true }, location);

bench('Синастрия (2 готовые карты)', () => {
  calculateSynastry(chartA, chartB);
}, 200);

bench('Транзиты (на текущий момент)', () => {
  calculateTransits(chartA, { utc: new Date(), timeKnown: true }, location);
}, 200);

console.log(`\nОриентир из анализа рынка: Chronos "Астропроцессор" — ~500мс/карта.`);
console.log(`ASTRA Engine (натальная карта, Placidus): ${natalMs < 500 ? 'быстрее ориентира' : 'медленнее ориентира'} — см. цифру выше.`);
