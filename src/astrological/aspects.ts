/**
 * Слой 2: ASTROLOGICAL ENGINE — аспекты.
 */
import { Aspect, AspectType, EclipticPoint, PlanetName } from '../types';
import { shortestDelta } from '../astronomical/planets';

const ASPECT_ANGLES: Record<AspectType, number> = {
  conjunction: 0,
  semisextile: 30,
  semisquare: 45,
  sextile: 60,
  square: 90,
  trine: 120,
  sesquiquadrate: 135,
  quincunx: 150,
  opposition: 180,
};

/** Орбы по умолчанию — Sun/Moon получают более широкий орб (классическая практика). */
function defaultOrb(type: AspectType, pointA: PlanetName, pointB: PlanetName): number {
  const majorOrbs: Record<AspectType, number> = {
    conjunction: 8, opposition: 8, square: 7, trine: 7, sextile: 5,
    semisextile: 2, semisquare: 2, sesquiquadrate: 2, quincunx: 3,
  };
  const base = majorOrbs[type];
  const luminaryInvolved = pointA === 'Sun' || pointA === 'Moon' || pointB === 'Sun' || pointB === 'Moon';
  return luminaryInvolved ? base + 2 : base;
}

export interface AspectOptions {
  types?: AspectType[];
  customOrbs?: Partial<Record<AspectType, number>>;
}

function angularDistance(a: number, b: number): number {
  const d = Math.abs(shortestDelta(a, b));
  return d;
}

export function findAspects(points: EclipticPoint[], options: AspectOptions = {}): Aspect[] {
  const types = options.types ?? (Object.keys(ASPECT_ANGLES) as AspectType[]);
  const aspects: Aspect[] = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const actual = angularDistance(a.longitude, b.longitude);

      for (const type of types) {
        const exact = ASPECT_ANGLES[type];
        const orb = options.customOrbs?.[type] ?? defaultOrb(type, a.name, b.name);
        const diff = Math.abs(actual - exact);
        if (diff <= orb) {
          // applying = |sep - target| убывает со временем, где sep = долгота b относительно a (-180..180],
          // target = ближайшая точная фаза аспекта того же знака, что и sep.
          const sep = shortestDelta(a.longitude, b.longitude);
          const target = sep === 0 ? exact : Math.sign(sep) * exact;
          const diffSigned = sep - target;
          const rateOfSepChange = b.speedLongitude - a.speedLongitude; // °/сутки
          const applying = diffSigned !== 0 && Math.sign(diffSigned) !== Math.sign(rateOfSepChange);
          aspects.push({
            pointA: a.name,
            pointB: b.name,
            type,
            exactAngle: exact,
            actualAngle: actual,
            orb: diff,
            maxOrb: orb,
            applying,
          });
          break; // одна пара точек — один (ближайший) аспект
        }
      }
    }
  }
  return aspects;
}
