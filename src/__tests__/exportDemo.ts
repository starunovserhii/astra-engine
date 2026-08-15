/**
 * Экспорт статических данных для демо-страницы GitHub Pages (index.html).
 * Считает один показательный натал разными системами домов и печатает
 * компактный JSON в stdout — используется build-скриптом сайта.
 */
import { calculateNatalChart } from '../charts/natal';
import { findAspects } from '../astrological/aspects';
import { HouseSystemId, EventMoment, AspectType } from '../types';

// Максимально широкие орбы (см. тот же WIDE_ASPECT_ORBS в site/template.html,
// buildChartData) — иначе демо-данные содержали бы аспекты только в пределах
// орбов движка по умолчанию, и ползунок орба в настройках колеса на демо-
// странице не мог бы показать что-то шире дефолта.
const WIDE_ASPECT_ORBS: Partial<Record<AspectType, number>> = {
  conjunction: 15, opposition: 15, square: 15, trine: 15, sextile: 15,
  semisextile: 15, semisquare: 15, sesquiquadrate: 15, quincunx: 15,
};

const location = { latitude: 55.751244, longitude: 37.618423, label: 'Москва' };
const moment: EventMoment = { utc: new Date(Date.UTC(1990, 5, 15, 8, 30, 0)), timeKnown: true };

const systems: HouseSystemId[] = ['placidus', 'wholeSign', 'equal', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitius'];

const base = calculateNatalChart(moment, location, { houseSystem: 'placidus' });

const points = base.points.map((p) => ({
  name: p.name,
  longitude: Number(p.longitude.toFixed(4)),
  sign: p.sign,
  degreeInSign: Number(p.degreeInSign.toFixed(2)),
  isRetrograde: p.isRetrograde,
}));

const dignities: Record<string, string> = {};
for (const [name, d] of Object.entries(base.dignities)) {
  if (d.rulership) dignities[name] = 'rulership';
  else if (d.exaltation) dignities[name] = 'exaltation';
  else if (d.detriment) dignities[name] = 'detriment';
  else if (d.fall) dignities[name] = 'fall';
}

const wideAspects = findAspects(base.points, { customOrbs: WIDE_ASPECT_ORBS });
const aspects = wideAspects.map((a) => ({
  a: a.pointA,
  b: a.pointB,
  type: a.type,
  orb: Number(a.orb.toFixed(2)),
  applying: a.applying,
}));

const housesBySystem: Record<string, { cusps: number[]; ascendant: number; midheaven: number; reliable: boolean }> = {};
for (const sys of systems) {
  const chart = sys === 'placidus' ? base : calculateNatalChart(moment, location, { houseSystem: sys });
  housesBySystem[sys] = {
    cusps: chart.houses.cusps.map((c) => Number(c.toFixed(4))),
    ascendant: Number(chart.houses.ascendant.toFixed(4)),
    midheaven: Number(chart.houses.midheaven.toFixed(4)),
    reliable: chart.houses.reliable,
  };
  // проставим дом для каждой точки под каждую систему домов отдельно
}

// дома точек под КАЖДУЮ систему (для переключателя на странице)
const pointHousesBySystem: Record<string, Record<string, number>> = {};
for (const sys of systems) {
  const chart = sys === 'placidus' ? base : calculateNatalChart(moment, location, { houseSystem: sys });
  const map: Record<string, number> = {};
  for (const p of chart.points) {
    if (p.house !== undefined) map[p.name] = p.house;
  }
  pointHousesBySystem[sys] = map;
}

const output = {
  meta: {
    label: 'Пример натальной карты — демонстрация ASTRA Engine (условные данные, 15.06.1990, 08:30, Москва)',
    engineVersion: base.meta.engineVersion,
    houseSystemDefault: 'placidus',
  },
  points,
  dignities,
  aspects,
  housesBySystem,
  pointHousesBySystem,
};

process.stdout.write(JSON.stringify(output));
