/**
 * Слой 1: ASTRONOMICAL ENGINE — положения тел.
 *
 * Источник эфемерид: astronomy-engine (MIT license, Don Cross).
 * Осознанный выбор вместо Swiss Ephemeris — см. проектный бриф ASTRA,
 * часть B, п.1: Swiss Ephemeris распространяется по двойной лицензии
 * AGPL/коммерческая, что создаёт юридический риск для закрытого SaaS.
 * astronomy-engine основан на VSOP87/ELP2000-подобных теориях и даёт
 * точность на уровне угловых секунд для планет — этого достаточно с
 * запасом для астрологических расчётов (Swiss Ephemeris сам по себе
 * тоже "всего лишь" реализация публичных теорий, не оригинальный
 * источник точности).
 */
import * as Astronomy from 'astronomy-engine';
import { EventMoment } from '../types';
import { toAstroTime } from './time';

export type MajorBody =
  | 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars'
  | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune' | 'Pluto';

const BODY_MAP: Record<MajorBody, Astronomy.Body> = {
  Sun: Astronomy.Body.Sun,
  Moon: Astronomy.Body.Moon,
  Mercury: Astronomy.Body.Mercury,
  Venus: Astronomy.Body.Venus,
  Mars: Astronomy.Body.Mars,
  Jupiter: Astronomy.Body.Jupiter,
  Saturn: Astronomy.Body.Saturn,
  Uranus: Astronomy.Body.Uranus,
  Neptune: Astronomy.Body.Neptune,
  Pluto: Astronomy.Body.Pluto,
};

export interface RawEclipticPosition {
  longitude: number; // 0-360, геоцентрическая, истинное эклиптическое равноденствие даты (то, что нужно тропической астрологии)
  latitude: number;
  distanceAU: number;
  speedLongitude: number; // °/сутки, знак определяет ретроградность
}

function normalize360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Кратчайшая разница b-a в градусах, диапазон (-180, 180] — чтобы central difference не ловил скачок 359°→1° */
function shortestDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Геоцентрическая эклиптическая долгота/широта тела на момент времени */
function eclipticLongLat(body: Astronomy.Body, time: Astronomy.AstroTime): { longitude: number; latitude: number; distanceAU: number } {
  const geo = Astronomy.GeoVector(body, time, true /* aberration */);
  const ecl = Astronomy.Ecliptic(geo); // true ecliptic of date — корректная система для тропической астрологии
  return {
    longitude: normalize360(ecl.elon),
    latitude: ecl.elat,
    distanceAU: Math.sqrt(geo.x * geo.x + geo.y * geo.y + geo.z * geo.z),
  };
}

/**
 * Положение большой планеты/Солнца/Луны с учётом скорости (для ретроградности).
 * Скорость — через центральную разность (h = 6 часов), это даёт устойчивый
 * результат и для быстрой Луны (~13°/сутки), и для медленных внешних планет.
 */
export function getMajorBodyPosition(body: MajorBody, moment: EventMoment): RawEclipticPosition {
  const time = toAstroTime(moment);
  const h = 0.25; // сутки (6 часов)
  const astroBody = BODY_MAP[body];

  const now = eclipticLongLat(astroBody, time);
  const before = eclipticLongLat(astroBody, time.AddDays(-h));
  const after = eclipticLongLat(astroBody, time.AddDays(h));

  const speed = shortestDelta(before.longitude, after.longitude) / (2 * h);

  return {
    longitude: now.longitude,
    latitude: now.latitude,
    distanceAU: now.distanceAU,
    speedLongitude: speed,
  };
}

export { shortestDelta, normalize360 };
