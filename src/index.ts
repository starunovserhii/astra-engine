/**
 * ASTRA Engine — публичный API.
 *
 * Архитектурный принцип (проектный бриф ASTRA, §8):
 *   ASTRONOMICAL ENGINE -> ASTROLOGICAL ENGINE -> (interpretation/AI — вне этого пакета)
 * Этот пакет отдаёт только числа и их источник (meta.warnings), никогда —
 * готовые текстовые выводы. Интерпретации — задача отдельного AI-слоя,
 * который получает результат этих функций как структурированный контекст.
 */
export * from './types';
export { toEventMoment, julianDayUT } from './astronomical/time';
export type { LocalBirthInput } from './astronomical/time';
export { getMajorBodyPosition } from './astronomical/planets';
export { calculateNatalChart } from './charts/natal';
export type { NatalChartOptions } from './charts/natal';
export { calculateSynastry } from './charts/synastry';
export type { SynastryResult } from './charts/synastry';
export { calculateTransits } from './charts/transits';
export type { TransitResult } from './charts/transits';
export { calculateSecondaryProgressions } from './charts/progressions';
export { calculateSolarReturn } from './charts/solarReturn';
export { calculateHoraryChart } from './charts/horary';
export { calculateHouses, houseOfPoint } from './astrological/houses';
export { findAspects } from './astrological/aspects';
export { essentialDignity } from './astrological/signs';
export { EngineVersion } from './version';
