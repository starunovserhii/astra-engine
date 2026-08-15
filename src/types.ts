/**
 * ASTRA Engine — общие типы.
 *
 * Архитектурный принцип (зафиксирован в проектном брифе ASTRA, §8):
 *   ASTRONOMICAL ENGINE -> ASTROLOGICAL ENGINE -> INTERPRETATION ENGINE -> AI
 * Этот пакет реализует первые два слоя. AI/интерпретации сюда не входят —
 * движок отдаёт только числа и их источник, никогда не текст выводов.
 */

/** Географическая точка события (рождение, консультация, транзит и т.д.) */
export interface GeoLocation {
  /** Градусы, положительное — север */
  latitude: number;
  /** Градусы, положительное — восток */
  longitude: number;
  /** Метры над уровнем моря, по умолчанию 0 */
  elevationMeters?: number;
  /** Название места — для отображения и логов, не участвует в расчётах */
  label?: string;
}

/** Момент времени события в UTC + метаданные о точности */
export interface EventMoment {
  /** Дата и время в UTC (уже сконвертированные из локального времени + часового пояса) */
  utc: Date;
  /**
   * Известно ли время с точностью до минуты.
   * false => расчёт переключается в режим solar chart (см. astrological/unknownTime.ts)
   */
  timeKnown: boolean;
}

export type PlanetName =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto'
  | 'Chiron'
  | 'MeanNode'
  | 'TrueNode'
  | 'MeanSouthNode'
  | 'TrueSouthNode'
  | 'MeanLilith'
  | 'TrueLilith'
  | 'PartOfFortune'
  | 'Vertex'
  | 'AntiVertex';

export const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;
export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

/** Позиция точки (планеты/куспида/фиктивной точки) на эклиптике */
export interface EclipticPoint {
  name: PlanetName;
  /** Эклиптическая долгота, 0-360°, тропический зодиак, истинное равноденствие даты */
  longitude: number;
  /** Эклиптическая широта, градусы (0 для домов/фиктивных точек без широты) */
  latitude: number;
  /** Геоцентрическое расстояние, а.е. (не определено для фиктивных точек) */
  distanceAU?: number;
  /** Суточная скорость по долготе, °/сутки. Отрицательная => ретроградность */
  speedLongitude: number;
  isRetrograde: boolean;
  sign: ZodiacSign;
  /** Градус внутри знака, 0-30 */
  degreeInSign: number;
  /** Номер дома (1-12), если рассчитаны куспиды; иначе undefined */
  house?: number;
}

export type HouseSystemId =
  | 'placidus'
  | 'wholeSign'
  | 'equal'
  | 'koch'
  | 'regiomontanus'
  | 'campanus'
  | 'porphyry'
  | 'alcabitius';

export interface HouseCusps {
  system: HouseSystemId;
  /** Долготы куспидов домов 1..12, индекс 0 = дом I */
  cusps: number[];
  ascendant: number;
  midheaven: number;
  /** false для карт без надёжного времени рождения (solar chart) */
  reliable: boolean;
}

export type AspectType =
  | 'conjunction'
  | 'opposition'
  | 'square'
  | 'trine'
  | 'sextile'
  | 'quincunx'
  | 'semisextile'
  | 'semisquare'
  | 'sesquiquadrate';

export interface Aspect {
  pointA: PlanetName;
  pointB: PlanetName;
  type: AspectType;
  /** Точный угол аспекта, ° (0, 30, 45, 60, 90, 120, 135, 150, 180) */
  exactAngle: number;
  /** Фактический угол между точками, ° */
  actualAngle: number;
  /** |actualAngle - exactAngle|, ° */
  orb: number;
  /** Максимально допустимый орб для этой пары, ° */
  maxOrb: number;
  /** Сближаются ли точки (true) или расходятся (false) */
  applying: boolean;
}

export interface EssentialDignity {
  rulership: boolean;
  exaltation: boolean;
  detriment: boolean;
  fall: boolean;
  /** Итоговый скор: +5 rulership, +4 exaltation, -5 detriment, -4 fall, 0 — нейтрально */
  score: number;
}

export type ChartKind = 'natal' | 'synastry' | 'transit' | 'secondaryProgression' | 'solarReturn' | 'horary';

export interface ChartMeta {
  kind: ChartKind;
  calculatedAt: string; // ISO timestamp расчёта, для воспроизводимости/логов
  engineVersion: string;
  timeKnown: boolean;
  houseSystem: HouseSystemId;
  ephemerisSource: 'astronomy-engine@MIT';
  warnings: string[];
}

export interface NatalChartResult {
  meta: ChartMeta;
  moment: EventMoment;
  location: GeoLocation;
  points: EclipticPoint[];
  houses: HouseCusps;
  aspects: Aspect[];
  dignities: Partial<Record<PlanetName, EssentialDignity>>;
}
