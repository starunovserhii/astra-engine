/**
 * Соляр (Solar Return) — момент, когда транзитное Солнце возвращается к
 * точной натальной долготе (§17 проектного брифа). Поиск точного момента —
 * через Astronomy.SearchSunLongitude (родная функция astronomy-engine,
 * бинарный поиск по геоцентрической эклиптической долготе Солнца).
 */
import * as Astronomy from 'astronomy-engine';
import { EventMoment, GeoLocation, HouseSystemId, NatalChartResult } from '../types';
import { calculateNatalChart } from './natal';

export interface SolarReturnOptions {
  houseSystem?: HouseSystemId;
  /** Место соляра — по умолчанию место рождения; многие астрологи используют место проживания на момент соляра */
  location?: GeoLocation;
}

export function calculateSolarReturn(natal: NatalChartResult, year: number, options: SolarReturnOptions = {}): NatalChartResult {
  const natalSunLon = natal.points.find((p) => p.name === 'Sun')!.longitude;
  const searchStart = new Date(Date.UTC(year, natal.moment.utc.getUTCMonth(), 1));
  const foundTime = Astronomy.SearchSunLongitude(natalSunLon, searchStart, 40);
  if (!foundTime) {
    throw new Error(`Не удалось найти момент соляра для ${year} года — проверьте входные данные.`);
  }

  const moment: EventMoment = { utc: foundTime.date, timeKnown: true };
  const location = options.location ?? natal.location;
  const result = calculateNatalChart(moment, location, { houseSystem: options.houseSystem ?? natal.meta.houseSystem });
  result.meta.kind = 'solarReturn';
  result.meta.warnings.push(`Solar Return ${year}: точный момент возврата Солнца к натальной долготе ${natalSunLon.toFixed(4)}° — ${moment.utc.toISOString()}.`);
  return result;
}
