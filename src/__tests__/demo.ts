/**
 * Демонстрация ASTRA Engine: натальная карта, синастрия, транзиты,
 * прогрессии, солар — на реальном примере (Оксана Пламенова, для которой
 * создаётся ASTRA; дата и место — условный пример, НЕ реальные данные
 * астролога — используются только как демонстрационные координаты Москвы).
 *
 * Запуск: npm run demo
 */
import { calculateNatalChart } from '../charts/natal';
import { calculateSynastry } from '../charts/synastry';
import { calculateTransits } from '../charts/transits';
import { calculateSecondaryProgressions } from '../charts/progressions';
import { calculateSolarReturn } from '../charts/solarReturn';
import { EventMoment } from '../types';

const location = { latitude: 55.751244, longitude: 37.618423, label: 'Москва' };
const personA: EventMoment = { utc: new Date(Date.UTC(1990, 5, 15, 8, 30, 0)), timeKnown: true };
const personB: EventMoment = { utc: new Date(Date.UTC(1988, 2, 3, 14, 10, 0)), timeKnown: true };

function printChartSummary(title: string, chart: ReturnType<typeof calculateNatalChart>) {
  console.log(`\n--- ${title} ---`);
  console.log(`Система домов: ${chart.meta.houseSystem}, надёжно: ${chart.houses.reliable}`);
  if (chart.meta.warnings.length) {
    console.log('Предупреждения:');
    chart.meta.warnings.forEach((w) => console.log(`  ! ${w}`));
  }
  console.log(`Asc: ${chart.houses.ascendant.toFixed(2)}°, MC: ${chart.houses.midheaven.toFixed(2)}°`);
  for (const p of chart.points.slice(0, 10)) {
    const dig = chart.dignities[p.name];
    let dignityStr = '';
    if (dig) {
      if (dig.rulership) dignityStr = ' [обитель]';
      else if (dig.exaltation) dignityStr = ' [экзальтация]';
      else if (dig.detriment) dignityStr = ' [изгнание]';
      else if (dig.fall) dignityStr = ' [падение]';
    }
    console.log(
      `  ${p.name.padEnd(10)} ${p.sign.padEnd(11)} ${p.degreeInSign.toFixed(2)}°  дом ${p.house ?? '-'}  ${p.isRetrograde ? '(R)' : '   '}${dignityStr}`,
    );
  }
  console.log(`Аспектов найдено: ${chart.aspects.length}`);
}

console.log('=== ASTRA Engine — демонстрация ===');

const chartA = calculateNatalChart(personA, location, { houseSystem: 'placidus' });
printChartSummary('Натальная карта A (Placidus)', chartA);

const chartAKoch = calculateNatalChart(personA, location, { houseSystem: 'koch' });
console.log(`\nСравнение Placidus vs Koch (та же карта): Asc идентичен (${chartA.houses.ascendant.toFixed(2)}° == ${chartAKoch.houses.ascendant.toFixed(2)}°), куспид 11 отличается: ${chartA.houses.cusps[10].toFixed(2)}° (Placidus) vs ${chartAKoch.houses.cusps[10].toFixed(2)}° (Koch).`);

const chartB = calculateNatalChart(personB, location, { houseSystem: 'placidus' });
const synastry = calculateSynastry(chartA, chartB);
console.log(`\n--- Синастрия A × B ---`);
console.log(`Межличностных аспектов: ${synastry.interAspects.length}`);
console.log('Первые 5:');
synastry.interAspects.slice(0, 5).forEach((a) => {
  console.log(`  ${a.pointA} ${a.type} ${a.pointB} (орб ${a.orb.toFixed(2)}°, ${a.applying ? 'применяется' : 'расходится'})`);
});

const transits = calculateTransits(chartA, { utc: new Date(), timeKnown: true }, location);
console.log(`\n--- Транзиты на сегодня (к карте A) ---`);
console.log(`Транзитных аспектов к натальным точкам: ${transits.aspectsToNatal.length}`);
transits.aspectsToNatal.slice(0, 5).forEach((a) => {
  // findAspects не гарантирует порядок pointA/pointB — определяем transit/natal по префиксу (T:/N:), а не по позиции.
  const [transitPoint, natalPoint] = String(a.pointA).startsWith('T:') ? [a.pointA, a.pointB] : [a.pointB, a.pointA];
  console.log(`  transit ${transitPoint} ${a.type} natal ${natalPoint} (орб ${a.orb.toFixed(2)}°)`);
});

const progressed = calculateSecondaryProgressions(chartA, new Date(), { houseSystem: 'placidus' });
console.log(`\n--- Вторичные прогрессии (сегодня) ---`);
const progSun = progressed.points.find((p) => p.name === 'Sun')!;
console.log(`Прогрессивное Солнце: ${progSun.sign} ${progSun.degreeInSign.toFixed(2)}°`);

const solar = calculateSolarReturn(chartA, new Date().getFullYear());
console.log(`\n--- Соляр на ${new Date().getFullYear()} год ---`);
console.log(`Момент соляра (UTC): ${solar.moment.utc.toISOString()}`);
console.log(`Asc соляра: ${solar.houses.ascendant.toFixed(2)}°`);

console.log('\n=== Готово ===');
