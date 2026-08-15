/**
 * Слой 2: ASTROLOGICAL ENGINE — производные точки (не небесные тела, а
 * вычисляемые из уже известных: Asc/MC/Sun/Moon).
 */
import { normalize360 } from '../astronomical/planets';

/**
 * Жребий Фортуны (Part of Fortune). Классическая формула различается для
 * дневных/ночных карт (Sun выше/ниже горизонта). Используем стандартную
 * (Hermetic) формулу:
 *   день:  Asc + Moon - Sun
 *   ночь:  Asc + Sun - Moon
 * "День" определяется по тому, находится ли Солнце над горизонтом —
 * приближённо через положение Солнца относительно домов 7-12 (над
 * горизонтом) вызывающей стороны; здесь принимаем явный флаг isDayChart,
 * рассчитанный на уровне сборки карты (там уже известны дома).
 */
export function partOfFortune(ascDeg: number, sunLon: number, moonLon: number, isDayChart: boolean): number {
  return isDayChart ? normalize360(ascDeg + moonLon - sunLon) : normalize360(ascDeg + sunLon - moonLon);
}

/**
 * Vertex — точка пересечения эклиптики с первым вертикалом на ЗАПАДНОЙ
 * стороне (иногда называется "электрический асцендент"). Считается как
 * Ascendant, но с широтой, дополненной до 90° (эквивалент вычисления в
 * системе координат первого вертикала), и взятой западной точкой пересечения.
 */
export function vertex(ramcDeg: number, latitudeDeg: number, obliquityDeg: number, ascendantFn: (i: { ramcDeg: number; latitudeDeg: number; obliquityDeg: number }) => number): number {
  const coLatitude = 90 - Math.abs(latitudeDeg);
  const sign = latitudeDeg >= 0 ? 1 : -1;
  // Vertex = "Asc", вычисленный при RAMC+180 и дополнительной широте — стандартный приём
  // (первый вертикал играет роль горизонта, если повернуть систему на 90°).
  const raw = ascendantFn({ ramcDeg: normalize360(ramcDeg + 180), latitudeDeg: sign * coLatitude, obliquityDeg });
  return raw;
}

export function antiVertex(vertexDeg: number): number {
  return normalize360(vertexDeg + 180);
}
