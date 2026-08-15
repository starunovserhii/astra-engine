/**
 * Слой 2: ASTROLOGICAL ENGINE — системы домов.
 *
 * Архитектурное решение из проектного брифа ASTRA (§7): расширяемая
 * архитектура систем домов (strategy pattern), не переписывающая ядро при
 * добавлении новой системы. Ниже — общий геометрический фундамент
 * (Ascendant/MC как пересечение эклиптики с горизонтом/меридианом, и
 * обобщённый метод "большого круга через точки N/S горизонта" для
 * квадрантных систем), на котором каждая система домов — это просто
 * другой способ параметризовать точку деления.
 *
 * Все формулы — стандартная сферическая астрономия/астрология,
 * публичная математика (не заимствованный код конкретного продукта).
 * Каждая система проверяется структурными самотестами в
 * src/__tests__/run.ts: cusp10=MC, cusp1=Asc, cusp(n+6)=cusp(n)+180,
 * монотонный порядок куспидов. Система, не прошедшая самотест, помечается
 * warning'ом в ChartMeta, а не выдаётся молча как надёжная.
 */
import { HouseCusps, HouseSystemId } from '../types';
import { normalize360, shortestDelta } from '../astronomical/planets';

const DEG = Math.PI / 180;
const toRad = (d: number) => d * DEG;
const toDeg = (r: number) => r / DEG;

export interface HouseInputs {
  ramcDeg: number; // RAMC = Local Apparent Sidereal Time * 15, градусы
  latitudeDeg: number;
  obliquityDeg: number;
}

/** λ(RA) — эклиптическая долгота точки на эклиптике (β=0) с данной прямой RA. Общая инверсия для MC/Asc/generic. */
function eclipticLongitudeFromRA(raDeg: number, obliquityDeg: number): number {
  const ra = toRad(raDeg);
  const eps = toRad(obliquityDeg);
  const lon = Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(eps));
  return normalize360(toDeg(lon));
}

function declinationOfEcliptic(lonDeg: number, obliquityDeg: number): number {
  return toDeg(Math.asin(Math.sin(toRad(obliquityDeg)) * Math.sin(toRad(lonDeg))));
}

function rightAscensionOfEcliptic(lonDeg: number, obliquityDeg: number): number {
  const lon = toRad(lonDeg);
  const eps = toRad(obliquityDeg);
  return normalize360(toDeg(Math.atan2(Math.cos(eps) * Math.sin(lon), Math.cos(lon))));
}

export function midheaven({ ramcDeg, obliquityDeg }: HouseInputs): number {
  return eclipticLongitudeFromRA(ramcDeg, obliquityDeg);
}

export function ascendant({ ramcDeg, latitudeDeg, obliquityDeg }: HouseInputs): number {
  const ramc = toRad(ramcDeg);
  const phi = toRad(latitudeDeg);
  const eps = toRad(obliquityDeg);
  const num = -Math.cos(ramc) * Math.cos(phi);
  const den = Math.sin(eps) * Math.sin(phi) + Math.cos(eps) * Math.sin(ramc) * Math.cos(phi);
  const lon = Math.atan2(num, den);
  return normalize360(toDeg(lon) + 180);
}

/**
 * Обобщённый метод: долгота пересечения эклиптики с большим кругом,
 * заданным нормалью n=(nx,ny,nz) в системе координат часового угла
 * (ось X -> меридиан/H=0, ось Y -> H=-90 в нашем соглашении, ось Z -> полюс мира).
 * branch выбирает одно из двух пересечений (они отстоят на 180°).
 */
function cuspFromNormal(n: [number, number, number], ramcDeg: number, obliquityDeg: number, branch: 0 | 1): number {
  const ramc = toRad(ramcDeg);
  const eps = toRad(obliquityDeg);
  const [nx, ny, nz] = n;
  const P = nx * Math.cos(ramc) - ny * Math.sin(ramc);
  const Q = nx * Math.sin(ramc) + ny * Math.cos(ramc);
  const lon = Math.atan2(-P, Q * Math.cos(eps) + nz * Math.sin(eps));
  return normalize360(toDeg(lon) + (branch === 1 ? 180 : 0));
}

function clampAcos(x: number): number {
  return Math.acos(Math.max(-1, Math.min(1, x)));
}

/** Semi-diurnal arc, градусы RA. undefined => точка циркумполярна на этой широте (Placidus/Alcabitius неприменимы) */
function semiDiurnalArc(latitudeDeg: number, declinationDeg: number): number | undefined {
  const arg = -Math.tan(toRad(latitudeDeg)) * Math.tan(toRad(declinationDeg));
  if (arg < -1 || arg > 1) return undefined;
  return toDeg(clampAcos(arg));
}

/** Placidus: точка трисекции СОБСТВЕННОЙ полудуги. Итеративное решение (стандартный метод для Placidus). */
function placidusCusp(targetHourAngleFn: (sdaOrSna: number) => number, useNight: boolean, inputs: HouseInputs, initialGuessDeg: number): number | undefined {
  const { ramcDeg, latitudeDeg, obliquityDeg } = inputs;
  let lon = initialGuessDeg;
  for (let i = 0; i < 30; i++) {
    const dec = declinationOfEcliptic(lon, obliquityDeg);
    const sda = semiDiurnalArc(latitudeDeg, dec);
    if (sda === undefined) return undefined;
    const arc = useNight ? 180 - sda : sda;
    const targetH = targetHourAngleFn(arc);
    const targetRA = normalize360(ramcDeg - targetH);
    const newLon = eclipticLongitudeFromRA(targetRA, obliquityDeg);
    if (Math.abs(shortestDelta(lon, newLon)) < 1e-6) return newLon;
    lon = newLon;
  }
  return lon;
}

function placidusSystem(inputs: HouseInputs, ascDeg: number, mcDeg: number): { cusps: number[]; reliable: boolean } {
  const ic = normalize360(mcDeg + 180);
  const desc = normalize360(ascDeg + 180);
  let reliable = true;
  const need = (v: number | undefined, fallback: number): number => {
    if (v === undefined) { reliable = false; return fallback; }
    return v;
  };
  const c11 = need(placidusCusp((sda) => -(1 / 3) * sda, false, inputs, normalize360(mcDeg + 30)), normalize360(mcDeg + 30));
  const c12 = need(placidusCusp((sda) => -(2 / 3) * sda, false, inputs, normalize360(mcDeg + 60)), normalize360(mcDeg + 60));
  const c9 = need(placidusCusp((sda) => (1 / 3) * sda, false, inputs, normalize360(mcDeg - 30)), normalize360(mcDeg - 30));
  const c8 = need(placidusCusp((sda) => (2 / 3) * sda, false, inputs, normalize360(mcDeg - 60)), normalize360(mcDeg - 60));
  const c3 = need(placidusCusp((sna) => -180 + (1 / 3) * sna, true, inputs, normalize360(ic + 30)), normalize360(ic + 30));
  const c2 = need(placidusCusp((sna) => -180 + (2 / 3) * sna, true, inputs, normalize360(ic + 60)), normalize360(ic + 60));
  const c5 = need(placidusCusp((sna) => 180 - (1 / 3) * sna, true, inputs, normalize360(ic - 30)), normalize360(ic - 30));
  const c6 = need(placidusCusp((sna) => 180 - (2 / 3) * sna, true, inputs, normalize360(ic - 60)), normalize360(ic - 60));

  return {
    cusps: [ascDeg, c2, c3, ic, c5, c6, desc, c8, c9, mcDeg, c11, c12],
    reliable,
  };
}

/**
 * Alcabitius: закрытая форма — трисекция полудуги АСЦЕНДЕНТА (RA-интервал
 * между RAMC и RA восходящего градуса), применённая симметрично в обе
 * стороны от RAMC для дневных куспидов (11,12,9,8); ночные куспиды
 * (2,3,5,6) — это ТОЧНЫЕ противоположности (+180°) дневных, а не
 * независимая трисекция полудуги ночи. Это принципиально важно: подстановка
 * фиксированной "sna = 180 - sda" в формулу, симметричную для Placidus
 * (где sda/sna берутся для КАЖДОЙ точки отдельно, с их собственным
 * склонением), для Alcabitius (где используется ОДНО значение sda —
 * Асцендента — для всех куспидов) ломает симметрию "cusp(n)+180=cusp(n+6)".
 * Проверено трисекцией через сдвиг RAMC + сверкой с независимым источником
 * (см. итоговый комментарий в src/__tests__/run.ts).
 */
function alcabitiusSystem(inputs: HouseInputs, ascDeg: number, mcDeg: number): { cusps: number[]; reliable: boolean } {
  const { ramcDeg, latitudeDeg, obliquityDeg } = inputs;
  const decAsc = declinationOfEcliptic(ascDeg, obliquityDeg);
  const sdaAsc = semiDiurnalArc(latitudeDeg, decAsc);
  const ic = normalize360(mcDeg + 180);
  const desc = normalize360(ascDeg + 180);

  if (sdaAsc === undefined) {
    // На околополярных широтах Alcabitius тоже неприменим — честно откатываемся на Equal и помечаем unreliable.
    const eq = equalSystem(ascDeg);
    return { cusps: eq.cusps, reliable: false };
  }
  const at = (h: number) => eclipticLongitudeFromRA(normalize360(ramcDeg + h), obliquityDeg);

  const c11 = at((1 / 3) * sdaAsc);
  const c12 = at((2 / 3) * sdaAsc);
  const c9 = at(-(1 / 3) * sdaAsc);
  const c8 = at(-(2 / 3) * sdaAsc);
  const c5 = normalize360(c11 + 180);
  const c6 = normalize360(c12 + 180);
  const c2 = normalize360(c8 + 180);
  const c3 = normalize360(c9 + 180);

  return { cusps: [ascDeg, c2, c3, ic, c5, c6, desc, c8, c9, mcDeg, c11, c12], reliable: true };
}

/** Regiomontanus: деление НЕБЕСНОГО ЭКВАТОРА на 30°-дуги от RAMC, большие круги через N/S точки горизонта. */
function regiomontanusSystem(inputs: HouseInputs, ascDeg: number, mcDeg: number): { cusps: number[]; reliable: boolean } {
  const { ramcDeg, latitudeDeg, obliquityDeg } = inputs;
  const phi = toRad(latitudeDeg);
  const A: [number, number, number] = [Math.sin(phi), 0, -Math.cos(phi)]; // ось N/S точек горизонта

  const equatorPointNormal = (hourAngleOffsetDeg: number): [number, number, number] => {
    const h = toRad(hourAngleOffsetDeg);
    const E: [number, number, number] = [Math.cos(h), -Math.sin(h), 0];
    // нормаль большого круга через A и E — векторное произведение
    const n: [number, number, number] = [
      A[1] * E[2] - A[2] * E[1],
      A[2] * E[0] - A[0] * E[2],
      A[0] * E[1] - A[1] * E[0],
    ];
    return n;
  };

  const cuspAt = (offsetDeg: number, branch: 0 | 1): number => cuspFromNormal(equatorPointNormal(offsetDeg), ramcDeg, obliquityDeg, branch);

  const ic = normalize360(mcDeg + 180);
  const desc = normalize360(ascDeg + 180);
  // ИСПРАВЛЕНО: изначально куспиды 11/12/5/6 использовали branch=0, что
  // давало "антиподальную" (на 180° развёрнутую) точку пересечения большого
  // круга с эклиптикой — куспиды формально удовлетворяли симметрии
  // cusp(n)+180=cusp(n+6) (обе ветви решения тоже симметричны), но попадали
  // в чужой квадрант (например, "cusp 11" оказывался в диапазоне cusp 5),
  // что ломало круговую монотонность (сумма 12 дуг уходила на 1080°=3×360°).
  // Проверено перебором обеих ветвей (см. отладочный скрипт) — branch=1
  // даёт куспид в геометрически верном квадранте для всех восьми точек.
  const c11 = cuspAt(-30, 1);
  const c12 = cuspAt(-60, 1);
  const c9 = cuspAt(30, 1);
  const c8 = cuspAt(60, 1);
  const c3 = cuspAt(-150, 1);
  const c2 = cuspAt(-120, 1);
  const c5 = cuspAt(150, 1);
  const c6 = cuspAt(120, 1);

  return { cusps: [ascDeg, c2, c3, ic, c5, c6, desc, c8, c9, mcDeg, c11, c12], reliable: true };
}

/** Campanus: деление ПЕРВОГО ВЕРТИКАЛА (через зенит) на 30°-дуги, большие круги через N/S точки горизонта. */
function campanusSystem(inputs: HouseInputs, ascDeg: number, mcDeg: number): { cusps: number[]; reliable: boolean } {
  const { ramcDeg, latitudeDeg, obliquityDeg } = inputs;
  const phi = toRad(latitudeDeg);
  const A: [number, number, number] = [Math.sin(phi), 0, -Math.cos(phi)];
  const Zenith: [number, number, number] = [Math.cos(phi), 0, Math.sin(phi)];
  // East point первого вертикала = A × Zenith (перпендикулярен обоим, лежит на горизонте)
  const East: [number, number, number] = [
    A[1] * Zenith[2] - A[2] * Zenith[1],
    A[2] * Zenith[0] - A[0] * Zenith[2],
    A[0] * Zenith[1] - A[1] * Zenith[0],
  ];

  const primeVerticalPoint = (angleDeg: number): [number, number, number] => {
    const a = toRad(angleDeg);
    return [
      Zenith[0] * Math.cos(a) + East[0] * Math.sin(a),
      Zenith[1] * Math.cos(a) + East[1] * Math.sin(a),
      Zenith[2] * Math.cos(a) + East[2] * Math.sin(a),
    ];
  };
  const normalFor = (angleDeg: number): [number, number, number] => {
    const E = primeVerticalPoint(angleDeg);
    return [A[1] * E[2] - A[2] * E[1], A[2] * E[0] - A[0] * E[2], A[0] * E[1] - A[1] * E[0]];
  };

  const cuspAt = (angleDeg: number, branch: 0 | 1): number => cuspFromNormal(normalFor(angleDeg), ramcDeg, obliquityDeg, branch);

  const ic = normalize360(mcDeg + 180);
  const desc = normalize360(ascDeg + 180);
  // ИСПРАВЛЕНО (тот же класс бага, что в Regiomontanus, см. комментарий
  // там): исходные (angle,branch) пары для Campanus давали куспиды в чужих
  // квадрантах, ломая круговую монотонность (сумма дуг уходила на
  // 3240°=9×360°). Ниже — проверенные перебором обеих ветвей и знаков угла
  // комбинации, каждая приземляется в геометрически верном квадранте.
  const c11 = cuspAt(-30, 1);
  const c12 = cuspAt(-60, 1);
  const c9 = cuspAt(30, 1);
  const c8 = cuspAt(60, 1);
  const c3 = cuspAt(30, 0);
  const c2 = cuspAt(60, 0);
  const c5 = cuspAt(-30, 0);
  const c6 = cuspAt(-60, 0);

  return { cusps: [ascDeg, c2, c3, ic, c5, c6, desc, c8, c9, mcDeg, c11, c12], reliable: true };
}

/**
 * Koch ("Birthplace system"): в отличие от Alcabitius (трисекция в
 * терминах прямого восхождения, "meridian"-формула), куспиды Koch — это
 * ТОЧКИ ГОРИЗОНТА (снова прогоняем через ascendant(), а не
 * eclipticLongitudeFromRA), вычисленные при сдвинутом RAMC. Это ключевое
 * геометрическое отличие Koch от Alcabitius, подтверждённое независимым
 * источником (Urania Trust, "The Astronomy of Houses": куспид считают как
 * "какой градус восходит" в сдвинутый момент сидерического времени, а не
 * как точку с заданным прямым восхождением).
 *
 * D = sda(declination MC) — семи-дуга (в RA) точки с тем же склонением,
 * что и МС. Граничные условия (проверены численно):
 *   ascendant(RAMC - D) == MC   (когда RAMC сдвинут на -D, восходит сам
 *                                 градус МС — по определению D)
 *   descendant(RAMC + D) == MC  (симметрично для захода)
 * где descendant(x) := ascendant(x) + 180. Трисекция:
 *   cusp11 = ascendant(RAMC - 2D/3)   (ближе к МС)
 *   cusp12 = ascendant(RAMC - D/3)    (ближе к Асц)
 *   cusp8  = descendant(RAMC + D/3)   (ближе к Десц)
 *   cusp9  = descendant(RAMC + 2D/3)  (ближе к МС)
 * Куспиды 2,3,5,6 — точные противоположности (+180°) куспидов 8,9,11,12
 * (ночная трисекция даёт те же точки только в частном случае D=90°/N=90°,
 * поэтому берём геометрически обязательную оппозицию, а не независимую
 * трисекцию SNA — та же логика, что и в Alcabitius, см. комментарий там).
 *
 * ИСПРАВЛЕНО дважды: (1) первая версия использовала неверные знаки сдвига
 * и независимую SNA-трисекцию для ночных куспидов, что ломало и
 * геометрический смысл, и монотонный порядок куспидов (сумма 12 дуг
 * уходила на кратные 360°); (2) вторая версия (eclipticLongitudeFromRA,
 * как у Alcabitius) была структурно симметрична, но геометрически неверна
 * для Koch — Koch куспиды физически лежат на пересечении эклиптики с
 * ГОРИЗОНТОМ (через ascendant()), а не на "меридианной" RA-точке.
 * Текущая версия проверена: граничные условия совпадают с MC/Asc/Desc
 * ровно, и все 8 куспидов попадают в правильный квадрант (структурные
 * самотесты — src/__tests__/run.ts).
 */
function kochSystem(inputs: HouseInputs, ascDeg: number, mcDeg: number): { cusps: number[]; reliable: boolean } {
  const { ramcDeg, latitudeDeg, obliquityDeg } = inputs;
  const decMc = declinationOfEcliptic(mcDeg, obliquityDeg);
  const sdaMc = semiDiurnalArc(latitudeDeg, decMc);
  const ic = normalize360(mcDeg + 180);
  const desc = normalize360(ascDeg + 180);

  if (sdaMc === undefined) {
    const eq = equalSystem(ascDeg);
    return { cusps: eq.cusps, reliable: false };
  }
  const ascAt = (shiftDeg: number) => ascendant({ ramcDeg: normalize360(ramcDeg + shiftDeg), latitudeDeg, obliquityDeg });
  const descAt = (shiftDeg: number) => normalize360(ascAt(shiftDeg) + 180);

  const c11 = ascAt(-(2 / 3) * sdaMc);
  const c12 = ascAt(-(1 / 3) * sdaMc);
  const c8 = descAt((1 / 3) * sdaMc);
  const c9 = descAt((2 / 3) * sdaMc);
  const c5 = normalize360(c11 + 180);
  const c6 = normalize360(c12 + 180);
  const c2 = normalize360(c8 + 180);
  const c3 = normalize360(c9 + 180);

  return { cusps: [ascDeg, c2, c3, ic, c5, c6, desc, c8, c9, mcDeg, c11, c12], reliable: true };
}

function wholeSignSystem(ascDeg: number): { cusps: number[]; reliable: boolean } {
  const base = Math.floor(ascDeg / 30) * 30;
  return { cusps: Array.from({ length: 12 }, (_, i) => normalize360(base + i * 30)), reliable: true };
}

function equalSystem(ascDeg: number): { cusps: number[]; reliable: boolean } {
  return { cusps: Array.from({ length: 12 }, (_, i) => normalize360(ascDeg + i * 30)), reliable: true };
}

function forward(a: number, b: number): number {
  return ((b - a) % 360 + 360) % 360;
}

function porphyrySystem(ascDeg: number, mcDeg: number): { cusps: number[]; reliable: boolean } {
  const ic = normalize360(mcDeg + 180);
  const desc = normalize360(ascDeg + 180);
  const q1 = forward(ascDeg, ic);
  const q2 = forward(ic, desc);
  const q3 = forward(desc, mcDeg);
  const q4 = forward(mcDeg, ascDeg);
  return {
    cusps: [
      ascDeg,
      normalize360(ascDeg + q1 / 3),
      normalize360(ascDeg + (2 * q1) / 3),
      ic,
      normalize360(ic + q2 / 3),
      normalize360(ic + (2 * q2) / 3),
      desc,
      normalize360(desc + q3 / 3),
      normalize360(desc + (2 * q3) / 3),
      mcDeg,
      normalize360(mcDeg + q4 / 3),
      normalize360(mcDeg + (2 * q4) / 3),
    ],
    reliable: true,
  };
}

export function calculateHouses(system: HouseSystemId, inputs: HouseInputs): HouseCusps {
  const ascDeg = ascendant(inputs);
  const mcDeg = midheaven(inputs);

  let result: { cusps: number[]; reliable: boolean };
  switch (system) {
    case 'wholeSign': result = wholeSignSystem(ascDeg); break;
    case 'equal': result = equalSystem(ascDeg); break;
    case 'porphyry': result = porphyrySystem(ascDeg, mcDeg); break;
    case 'placidus': result = placidusSystem(inputs, ascDeg, mcDeg); break;
    case 'alcabitius': result = alcabitiusSystem(inputs, ascDeg, mcDeg); break;
    case 'regiomontanus': result = regiomontanusSystem(inputs, ascDeg, mcDeg); break;
    case 'campanus': result = campanusSystem(inputs, ascDeg, mcDeg); break;
    case 'koch': result = kochSystem(inputs, ascDeg, mcDeg); break;
    default:
      throw new Error(`Unknown house system: ${system}`);
  }

  return { system, cusps: result.cusps, ascendant: ascDeg, midheaven: mcDeg, reliable: result.reliable };
}

export function houseOfPoint(longitude: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    const span = forward(start, end);
    const pos = forward(start, longitude);
    if (pos < span || span === 0) return i + 1;
  }
  return 12;
}
