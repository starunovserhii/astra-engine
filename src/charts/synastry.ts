/**
 * Синастрия — межличностные аспекты + наложение домов (§18 проектного брифа).
 */
import { EclipticPoint, GeoLocation, NatalChartResult } from '../types';
import { findAspects } from '../astrological/aspects';
import { houseOfPoint } from '../astrological/houses';

export interface SynastryResult {
  personA: NatalChartResult;
  personB: NatalChartResult;
  /** Аспекты между точками A и точками B (не внутри одной карты) */
  interAspects: ReturnType<typeof findAspects>;
  /** В каком доме карты A оказывается каждая точка B, и наоборот */
  houseOverlayAinB: Record<string, number>;
  houseOverlayBinA: Record<string, number>;
}

function prefixed(points: EclipticPoint[], tag: string): EclipticPoint[] {
  return points.map((p) => ({ ...p, name: `${tag}:${p.name}` as any }));
}

export function calculateSynastry(personA: NatalChartResult, personB: NatalChartResult): SynastryResult {
  const combined = [...prefixed(personA.points, 'A'), ...prefixed(personB.points, 'B')];
  const allAspects = findAspects(combined);
  // оставляем только межличностные (A:x - B:y), внутрикартовые уже посчитаны в самих personA/personB
  const interAspects = allAspects.filter(
    (a) => (String(a.pointA).startsWith('A:') && String(a.pointB).startsWith('B:')) ||
      (String(a.pointA).startsWith('B:') && String(a.pointB).startsWith('A:')),
  );

  const houseOverlayBinA: Record<string, number> = {};
  for (const p of personB.points) {
    houseOverlayBinA[p.name] = houseOfPoint(p.longitude, personA.houses.cusps);
  }
  const houseOverlayAinB: Record<string, number> = {};
  for (const p of personA.points) {
    houseOverlayAinB[p.name] = houseOfPoint(p.longitude, personB.houses.cusps);
  }

  return { personA, personB, interAspects, houseOverlayAinB, houseOverlayBinA };
}

export { GeoLocation };
