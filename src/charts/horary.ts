/**
 * Хорар — структурно та же натальная карта, но для момента ЗАДАННОГО
 * ВОПРОСА, а не рождения (в отличие от натальной, время здесь всегда
 * известно точно — момент, когда вопрос был сформулирован/принят).
 * Отдельная функция — не потому что математика другая, а чтобы
 * ChartMeta.kind='horary' был явным сигналом для AI-слоя не путать
 * "чей это человек" интерпретации с натальными.
 */
import { EventMoment, GeoLocation, HouseSystemId, NatalChartResult } from '../types';
import { calculateNatalChart } from './natal';

export function calculateHoraryChart(questionMoment: EventMoment, location: GeoLocation, houseSystem: HouseSystemId = 'regiomontanus'): NatalChartResult {
  // Regiomontanus — исторически наиболее употребимая система для хорарной астрологии
  const result = calculateNatalChart({ ...questionMoment, timeKnown: true }, location, { houseSystem });
  result.meta.kind = 'horary';
  return result;
}
