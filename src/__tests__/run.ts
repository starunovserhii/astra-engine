/**
 * Тестовый набор ASTRA Engine.
 *
 * Часть 1 — структурные самотесты систем домов (симметрия, углы).
 * Часть 2 — валидация против ЭТАЛОННОЙ карты с astro.com/Astrodienst
 *   (Swiss Ephemeris, Rodden Rating AA — надёжность данных подтверждена
 *   оригиналом свидетельства о рождении): Альберт Эйнштейн,
 *   14 марта 1879, 11:30 LMT (= 10:50 UT), Ульм, 48n24 10e00.
 *   Источник: https://www.astro.com/astro-databank/Einstein,_Albert
 *   Эталон: Солнце 23°30' Рыбы, Луна 14°32' Стрельца, Asc 11°39' Рака,
 *   Sidereal Time 22:56:44.
 */
import { calculateNatalChart } from '../charts/natal';
import { calculateHouses, ascendant, midheaven } from '../astrological/houses';
import { localApparentSiderealTime, trueObliquity } from '../astronomical/time';
import { EventMoment, HouseSystemId } from '../types';
import { normalize360, shortestDelta } from '../astronomical/planets';

let failures = 0;
let checks = 0;

function assertClose(label: string, actual: number, expected: number, toleranceDeg: number) {
  checks++;
  const diff = Math.abs(shortestDelta(expected, actual));
  const ok = diff <= toleranceDeg;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: actual=${actual.toFixed(4)}° expected=${expected.toFixed(4)}° diff=${(diff * 60).toFixed(2)}' (tol=${(toleranceDeg * 60).toFixed(0)}')`);
}

function assertTrue(label: string, cond: boolean) {
  checks++;
  if (!cond) failures++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`);
}

function dms(deg: number, min: number): number {
  return deg + min / 60;
}

// ---------- Часть 1: структурные самотесты систем домов ----------
console.log('=== Часть 1: структурные самотесты систем домов ===');
const HOUSE_SYSTEMS: HouseSystemId[] = ['placidus', 'wholeSign', 'equal', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitius'];

// Тестовая точка: средние широты (Берлин), где все системы валидны (не циркумполярные проблемы)
const testInputs = { ramcDeg: 123.456, latitudeDeg: 52.5, obliquityDeg: 23.436 };
const asc = ascendant(testInputs);
const mc = midheaven(testInputs);

for (const sys of HOUSE_SYSTEMS) {
  const houses = calculateHouses(sys, testInputs);
  assertTrue(`${sys}: reliable`, houses.reliable);
  // Whole Sign и Equal по определению НЕ ставят куспид 1 в точный градус
  // Асцендента (Whole Sign: куспид 1 = 0° знака Асцендента; Equal: куспид 10
  // не обязан совпадать с МС вообще — это фича системы, а не баг движка).
  // Остальные (квадрантные) системы обязаны точно совпадать с Asc/MC/IC/Desc.
  if (sys !== 'wholeSign') {
    assertClose(`${sys}: cusp1 == Asc`, houses.cusps[0], asc, 1e-6);
    assertClose(`${sys}: cusp7 == Desc (Asc+180)`, houses.cusps[6], normalize360(asc + 180), 1e-6);
  }
  if (sys !== 'wholeSign' && sys !== 'equal') {
    assertClose(`${sys}: cusp10 == MC`, houses.cusps[9], mc, 1e-6);
    assertClose(`${sys}: cusp4 == IC (MC+180)`, houses.cusps[3], normalize360(mc + 180), 1e-6);
  }
  for (let n = 1; n <= 6; n++) {
    assertClose(`${sys}: cusp${n}+180 == cusp${n + 6}`, normalize360(houses.cusps[n - 1] + 180), houses.cusps[n - 1 + 6], 0.01);
  }
  // монотонность: каждый следующий куспид дальше по кругу, чем предыдущий (в сумме ровно 360°)
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const span = ((houses.cusps[(i + 1) % 12] - houses.cusps[i] + 360) % 360) || 360;
    total += span;
  }
  // ВАЖНО: сравнение без wrap-around (assertClose через shortestDelta не
  // отличит 360° от 720°/2520° — именно так тест изначально пропустил
  // реальный баг в Koch). Здесь нужно точное значение, не по модулю 360.
  checks++;
  {
    const diff = Math.abs(total - 360);
    const ok = diff <= 0.01;
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${sys}: сумма 12 дуг куспидов == 360° (без wrap): actual=${total.toFixed(4)}° diff=${diff.toFixed(4)}°`);
  }
}

// ---------- Часть 2: валидация против эталонной карты (Эйнштейн) ----------
console.log('\n=== Часть 2: валидация против astro.com (Эйнштейн, AA rating) ===');

const moment: EventMoment = { utc: new Date(Date.UTC(1879, 2, 14, 10, 50, 0)), timeKnown: true };
const location = { latitude: dms(48, 24), longitude: dms(10, 0), label: 'Ulm, Germany' };

const chart = calculateNatalChart(moment, location, { houseSystem: 'placidus' });

const sun = chart.points.find((p) => p.name === 'Sun')!;
const moon = chart.points.find((p) => p.name === 'Moon')!;

const expectedSun = 330 + dms(23, 30); // Pisces начинается с 330°
const expectedMoon = 240 + dms(14, 32); // Sagittarius начинается с 240°
const expectedAsc = 90 + dms(11, 39); // Cancer начинается с 90°
const expectedLstHours = 22 + 56 / 60 + 44 / 3600;

assertClose('Sun longitude', sun.longitude, expectedSun, 2 / 60); // 2 угловые минуты — комфортный запас для VSOP87-класса точности
assertClose('Moon longitude', moon.longitude, expectedMoon, 5 / 60); // Луна быстрее, чуть шире допуск
assertClose('Ascendant', chart.houses.ascendant, expectedAsc, 5 / 60);

const lst = localApparentSiderealTime(moment, location.longitude);
assertClose('Local Sidereal Time (часы, переведено в градусы для сравнения)', lst * 15, expectedLstHours * 15, 15 / 60); // 1 минута времени допуска

console.log(`\n${checks - failures}/${checks} проверок пройдено.`);
if (failures > 0) {
  console.log(`\n${failures} FAILED — движок требует доработки перед использованием в проде.`);
  process.exit(1);
} else {
  console.log('\nВсе проверки пройдены.');
}
