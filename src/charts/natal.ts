/**
 * Верхний уровень: сборка натальной карты из астрономического +
 * астрологического слоёв. Здесь же — обработка "время рождения неизвестно"
 * (решение из проектного брифа ASTRA, часть B, п.4): вместо блокировки
 * или тихой подстановки полудня/полуночи как достоверных данных, строим
 * solar chart (Солнце в начале 1 дома, без надёжных куспидов) и явно
 * помечаем это в meta.warnings.
 */
import { EngineVersion } from '../version';
import {
  ChartMeta, EclipticPoint, EventMoment, GeoLocation, HouseSystemId,
  NatalChartResult, PlanetName, ZodiacSign,
} from '../types';
import { getMajorBodyPosition, MajorBody } from '../astronomical/planets';
import {
  chironLongitude, meanLilithLongitude, meanNodeLongitude, trueLilithLongitude, trueNodeLongitude,
} from '../astronomical/specialPoints';
import { greenwichApparentSiderealTime, localApparentSiderealTime, trueObliquity } from '../astronomical/time';
import { degreeInSign, essentialDignity, signOf } from '../astrological/signs';
import { calculateHouses, houseOfPoint, ascendant } from '../astrological/houses';
import { findAspects } from '../astrological/aspects';
import { antiVertex, partOfFortune, vertex } from '../astrological/derivedPoints';

const MAJOR_BODIES: MajorBody[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

export interface NatalChartOptions {
  houseSystem?: HouseSystemId;
  includeChiron?: boolean;
  includeLilith?: 'mean' | 'true' | 'both' | 'none';
  includeNode?: 'mean' | 'true' | 'both' | 'none';
  includeVertex?: boolean;
  includePartOfFortune?: boolean;
}

const DEFAULT_OPTIONS: Required<NatalChartOptions> = {
  houseSystem: 'placidus',
  includeChiron: true,
  includeLilith: 'both',
  includeNode: 'both',
  includeVertex: true,
  includePartOfFortune: true,
};

function toPoint(name: PlanetName, longitude: number, latitude: number, speedLongitude: number, distanceAU?: number): EclipticPoint {
  return {
    name,
    longitude,
    latitude,
    distanceAU,
    speedLongitude,
    isRetrograde: speedLongitude < 0,
    sign: signOf(longitude),
    degreeInSign: degreeInSign(longitude),
  };
}

export function calculateNatalChart(
  moment: EventMoment,
  location: GeoLocation,
  options: NatalChartOptions = {},
): NatalChartResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];

  const points: EclipticPoint[] = [];
  for (const body of MAJOR_BODIES) {
    const pos = getMajorBodyPosition(body, moment);
    points.push(toPoint(body, pos.longitude, pos.latitude, pos.speedLongitude, pos.distanceAU));
  }

  if (opts.includeChiron) {
    const chiron = chironLongitude(moment);
    warnings.push('Chiron: двухтельная кеплеровская орбита от элементов на эпоху 2025-01-01, точность падает при удалении от эпохи — см. astronomical/specialPoints.ts.');
    points.push(toPoint('Chiron', chiron.longitude, 0, chiron.speedLongitude));
  }

  if (opts.includeNode === 'mean' || opts.includeNode === 'both') {
    const n = meanNodeLongitude(moment);
    points.push(toPoint('MeanNode', n.longitude, 0, n.speedLongitude));
    points.push(toPoint('MeanSouthNode', (n.longitude + 180) % 360, 0, n.speedLongitude));
  }
  if (opts.includeNode === 'true' || opts.includeNode === 'both') {
    const n = trueNodeLongitude(moment);
    points.push(toPoint('TrueNode', n.longitude, 0, n.speedLongitude));
    points.push(toPoint('TrueSouthNode', (n.longitude + 180) % 360, 0, n.speedLongitude));
  }
  if (opts.includeLilith === 'mean' || opts.includeLilith === 'both') {
    const l = meanLilithLongitude(moment);
    points.push(toPoint('MeanLilith', l.longitude, 0, l.speedLongitude));
  }
  if (opts.includeLilith === 'true' || opts.includeLilith === 'both') {
    const l = trueLilithLongitude(moment);
    points.push(toPoint('TrueLilith', l.longitude, 0, l.speedLongitude));
  }

  const timeKnown = moment.timeKnown;
  let houses;
  let ascDeg: number | undefined;
  let mcDeg: number | undefined;

  if (timeKnown) {
    const eps = trueObliquity(moment);
    const lst = localApparentSiderealTime(moment, location.longitude);
    const ramcDeg = lst * 15;
    houses = calculateHouses(opts.houseSystem, { ramcDeg, latitudeDeg: location.latitude, obliquityDeg: eps });
    ascDeg = houses.ascendant;
    mcDeg = houses.midheaven;

    for (const p of points) {
      p.house = houseOfPoint(p.longitude, houses.cusps);
    }

    if (!houses.reliable) {
      warnings.push(`Система домов ${opts.houseSystem} математически неприменима для этой широты (циркумполярная зона) — куспиды посчитаны запасным методом (Equal) и не надёжны, meta.houses.reliable=false.`);
    }

    if (opts.includeVertex) {
      const vtx = vertex(ramcDeg, location.latitude, eps, ascendant);
      points.push(toPoint('Vertex', vtx, 0, 0));
      points.push(toPoint('AntiVertex', antiVertex(vtx), 0, 0));
    }

    if (opts.includePartOfFortune) {
      const sun = points.find((p) => p.name === 'Sun')!;
      const moon = points.find((p) => p.name === 'Moon')!;
      const sunHouse = houseOfPoint(sun.longitude, houses.cusps);
      const isDayChart = sunHouse >= 7 && sunHouse <= 12; // дома 7-12 = над горизонтом
      const pof = partOfFortune(ascDeg, sun.longitude, moon.longitude, isDayChart);
      points.push(toPoint('PartOfFortune', pof, 0, 0));
      const pofPoint = points[points.length - 1];
      pofPoint.house = houseOfPoint(pof, houses.cusps);
    }
  } else {
    // SOLAR CHART fallback: Солнце фиксируется в начале 1 дома (эквивалент
    // Whole Sign от знака Солнца), куспиды не строятся, дом-зависимые точки
    // (Vertex, Part of Fortune) не рассчитываются — честно опускаются, а
    // не подставляются с ложной точностью.
    warnings.push('Время рождения неизвестно: построена SOLAR CHART. Дома, Asc/MC, Vertex и Жребий Фортуны недоступны — это ограничение метода, а не карты клиента.');
    const sun = points.find((p) => p.name === 'Sun')!;
    const sunSignStart = Math.floor(sun.longitude / 30) * 30;
    houses = {
      system: opts.houseSystem,
      cusps: Array.from({ length: 12 }, (_, i) => (sunSignStart + i * 30) % 360),
      ascendant: sunSignStart,
      midheaven: (sunSignStart + 270) % 360,
      reliable: false,
    };
    for (const p of points) {
      p.house = houseOfPoint(p.longitude, houses.cusps);
    }
  }

  const aspects = findAspects(points);

  const dignities: NatalChartResult['dignities'] = {};
  for (const p of points) {
    if (['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'].includes(p.name)) {
      dignities[p.name] = essentialDignity(p.name, p.longitude);
    }
  }

  const meta: ChartMeta = {
    kind: 'natal',
    calculatedAt: new Date().toISOString(),
    engineVersion: EngineVersion,
    timeKnown,
    houseSystem: opts.houseSystem,
    ephemerisSource: 'astronomy-engine@MIT',
    warnings,
  };

  return { meta, moment, location, points, houses, aspects, dignities };
}
