/**
 * Транзиты — положения "сейчас" (или на любой заданный момент) относительно
 * натальных точек (§15 проектного брифа).
 */
import { EclipticPoint, EventMoment, GeoLocation, NatalChartResult } from '../types';
import { calculateNatalChart } from './natal';
import { findAspects } from '../astrological/aspects';
import { houseOfPoint } from '../astrological/houses';

export interface TransitResult {
  natal: NatalChartResult;
  transitMoment: EventMoment;
  transitingPoints: EclipticPoint[];
  /** В каком натальном доме находится каждая транзитная планета */
  transitingPointHouses: Record<string, number>;
  /** Аспекты транзитных планет к натальным точкам */
  aspectsToNatal: ReturnType<typeof findAspects>;
}

function prefixed(points: EclipticPoint[], tag: string): EclipticPoint[] {
  return points.map((p) => ({ ...p, name: `${tag}:${p.name}` as any }));
}

export function calculateTransits(natal: NatalChartResult, transitMoment: EventMoment, transitLocation: GeoLocation = natal.location): TransitResult {
  // Транзитные точки считаются без домов/углов (нам не нужен транзитный Asc для этой функции — только позиции планет)
  const transitChart = calculateNatalChart(transitMoment, transitLocation, { includeVertex: false, includePartOfFortune: false });

  const combined = [...prefixed(natal.points, 'N'), ...prefixed(transitChart.points, 'T')];
  const allAspects = findAspects(combined);
  const aspectsToNatal = allAspects.filter(
    (a) => (String(a.pointA).startsWith('T:') && String(a.pointB).startsWith('N:')) ||
      (String(a.pointA).startsWith('N:') && String(a.pointB).startsWith('T:')),
  );

  const transitingPointHouses: Record<string, number> = {};
  for (const p of transitChart.points) {
    transitingPointHouses[p.name] = houseOfPoint(p.longitude, natal.houses.cusps);
  }

  return {
    natal,
    transitMoment,
    transitingPoints: transitChart.points,
    transitingPointHouses,
    aspectsToNatal,
  };
}
