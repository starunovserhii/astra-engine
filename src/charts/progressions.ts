/**
 * Вторичные прогрессии — "день за год" (§16 проектного брифа).
 * Прогрессированная дата = дата рождения + (целевая дата - дата рождения в
 * годах) суток. Прогрессированные Asc/MC — через прогрессированное звёздное
 * время (стандартный, наиболее распространённый метод).
 */
import { EventMoment, GeoLocation, HouseSystemId, NatalChartResult } from '../types';
import { calculateNatalChart } from './natal';

export interface ProgressionOptions {
  houseSystem?: HouseSystemId;
}

export function calculateSecondaryProgressions(
  natal: NatalChartResult,
  targetDate: Date,
  options: ProgressionOptions = {},
): NatalChartResult {
  const birthUtc = natal.moment.utc.getTime();
  const msPerYear = 365.25 * 24 * 3600 * 1000;
  const elapsedYears = (targetDate.getTime() - birthUtc) / msPerYear;
  const progressedUtcMillis = birthUtc + elapsedYears * 24 * 3600 * 1000; // 1 сутки = 1 год

  const progressedMoment: EventMoment = { utc: new Date(progressedUtcMillis), timeKnown: natal.moment.timeKnown };

  // Прогрессированные дома считаются на месте рождения (стандартная практика для secondary progressions)
  const result = calculateNatalChart(progressedMoment, natal.location, {
    houseSystem: options.houseSystem ?? natal.meta.houseSystem,
  });
  result.meta.kind = 'secondaryProgression';
  result.meta.warnings.push(
    `Вторичная прогрессия на ${targetDate.toISOString().slice(0, 10)}: прогрессированная дата ${progressedMoment.utc.toISOString()} (день-за-год, ${elapsedYears.toFixed(2)} лет от рождения).`,
  );
  return result;
}
