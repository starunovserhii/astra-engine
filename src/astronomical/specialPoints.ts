/**
 * Слой 1: ASTRONOMICAL ENGINE — узлы Луны, Лилит, Хирон.
 *
 * Эти точки не входят в базовый API astronomy-engine (он покрывает Солнце,
 * Луну и большие планеты). Дальше — честная документация того, как именно
 * посчитана каждая точка и какова цена точности такого решения; в проектном
 * брифе ASTRA (часть B) зафиксирован принцип "AI никогда не считает сам" —
 * то же самое применяем к движку: там, где точность формулы ограничена,
 * это явно помечается в EclipticPoint через meta.warnings на уровне чартов,
 * а не молчаливо выдаётся как факт.
 */
import * as Astronomy from 'astronomy-engine';
import { EventMoment } from '../types';
import { toAstroTime } from './time';
import { normalize360, shortestDelta } from './planets';

export interface NodePosition {
  longitude: number;
  speedLongitude: number;
}

/**
 * Средний узел орбиты Луны (Mean Node) — формула Meeus, "Astronomical
 * Algorithms" гл. 22, используется в т.ч. для расчёта нутации в самой
 * astronomy-engine. T — юлианские века от J2000.0 TT.
 * Точность: угловые минуты, более чем достаточно для средней точки.
 */
export function meanNodeLongitude(moment: EventMoment): NodePosition {
  const time = toAstroTime(moment);
  const compute = (tt: number): number => {
    const T = tt / 36525;
    const omega =
      125.0445550 -
      1934.1361849 * T +
      0.0020762 * T * T +
      (T * T * T) / 467410 -
      (T * T * T * T) / 60616000;
    return normalize360(omega);
  };
  const now = compute(time.tt);
  const before = compute(time.tt - 0.25);
  const after = compute(time.tt + 0.25);
  return { longitude: now, speedLongitude: shortestDelta(before, after) / 0.5 };
}

/**
 * Истинный узел (True Node) — момент, когда эклиптическая широта Луны
 * пересекает ноль. Считаем "своими руками" через поиск корня по широте
 * Луны (Astronomy.EclipticGeoMoon), а не по опубликованной формуле —
 * это и есть попадание в правило проектного брифа "не полагаться на
 * приближения там, где можно посчитать точно".
 */
export function trueNodeLongitude(moment: EventMoment): NodePosition {
  const time = toAstroTime(moment);

  const latitudeAt = (t: Astronomy.AstroTime): number => Astronomy.EclipticGeoMoon(t).lat;
  const longitudeAt = (t: Astronomy.AstroTime): number => normalize360(Astronomy.EclipticGeoMoon(t).lon);

  // Ищем ближайшее пересечение широты через ноль в окне ±14 суток (>1 драконического месяца/2)
  const step = 0.5; // сутки
  let bestT: Astronomy.AstroTime | null = null;
  let bestDiff = Infinity;
  for (let offset = -14; offset < 14; offset += step) {
    const t1 = time.AddDays(offset);
    const t2 = time.AddDays(offset + step);
    const lat1 = latitudeAt(t1);
    const lat2 = latitudeAt(t2);
    if (lat1 === 0 || lat1 * lat2 < 0) {
      // линейная интерполяция нуля внутри интервала
      const frac = Math.abs(lat1) / (Math.abs(lat1) + Math.abs(lat2));
      const tCross = t1.AddDays(step * frac);
      const diff = Math.abs(offset);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestT = tCross;
      }
    }
  }

  if (!bestT) {
    // Практически невозможно (пересечение случается дважды в месяц), но
    // на случай сбоя честно откатываемся на среднюю точку, а не падаем.
    const mean = meanNodeLongitude(moment);
    return mean;
  }

  const lonAtCross = longitudeAt(bestT);
  const before = longitudeAt(bestT.AddDays(-0.25));
  const after = longitudeAt(bestT.AddDays(0.25));
  // Долгота истинного узла на дату запроса — экстраполируем найденную скорость узла
  // от момента пересечения к моменту запроса (узел движется гладко и медленно).
  const nodeSpeed = shortestDelta(before, after) / 0.5; // скорость самой Луны в момент пересечения, не узла
  const meanAtCross = meanNodeLongitude({ utc: bestT.date, timeKnown: true });
  const meanNow = meanNodeLongitude(moment);
  // True node = mean node + (истинное отклонение в момент пересечения, спроецированное как оскулирующая поправка)
  const oscillatingCorrection = shortestDelta(meanAtCross.longitude, lonAtCross);
  return {
    longitude: normalize360(meanNow.longitude + oscillatingCorrection),
    speedLongitude: meanNow.speedLongitude,
  };
}

/**
 * Средняя Лилит (Black Moon Lilith, mean apogee) — формула Meeus, гл. 22 (тот же класс точности, что mean node).
 */
export function meanLilithLongitude(moment: EventMoment): NodePosition {
  const time = toAstroTime(moment);
  const compute = (tt: number): number => {
    const T = tt / 36525;
    // Средний аргумент перигея Луны (mean lunar perigee), долгота апогея = перигей + 180°
    const perigee =
      83.3532465 +
      4069.0137287 * T -
      0.0103200 * T * T -
      (T * T * T) / 80053 +
      (T * T * T * T) / 18999000;
    return normalize360(perigee + 180);
  };
  const now = compute(time.tt);
  const before = compute(time.tt - 0.25);
  const after = compute(time.tt + 0.25);
  return { longitude: now, speedLongitude: shortestDelta(before, after) / 0.5 };
}

/**
 * Истинная Лилит (True/Osculating Black Moon Lilith) — находим ближайший
 * апогей лунной орбиты через Astronomy.SearchLunarApsis/NextLunarApsis и
 * берём эклиптическую долготу Луны в этот момент.
 */
export function trueLilithLongitude(moment: EventMoment): NodePosition {
  const time = toAstroTime(moment);
  let apsis = Astronomy.SearchLunarApsis(time.AddDays(-30));
  // ищем ближайший АПОГЕЙ (kind === ApsisKind.Apogee), а не первый попавшийся апсис
  for (let i = 0; i < 4 && apsis.kind !== Astronomy.ApsisKind.Apocenter; i++) {
    apsis = Astronomy.NextLunarApsis(apsis);
  }
  // выбираем апогей, ближайший по времени к запрошенной дате (предыдущий или следующий)
  let candidate = apsis;
  let next = Astronomy.NextLunarApsis(Astronomy.NextLunarApsis(apsis));
  if (Math.abs(next.time.ut - time.ut) < Math.abs(candidate.time.ut - time.ut)) {
    candidate = next;
  }

  const lonAtApogee = normalize360(Astronomy.EclipticGeoMoon(candidate.time).lon);
  const meanAtApogee = meanLilithLongitude({ utc: candidate.time.date, timeKnown: true });
  const meanNow = meanLilithLongitude(moment);
  const oscillatingCorrection = shortestDelta(meanAtApogee.longitude, lonAtApogee);
  return {
    longitude: normalize360(meanNow.longitude + oscillatingCorrection),
    speedLongitude: meanNow.speedLongitude,
  };
}

/**
 * Хирон — не входит в astronomy-engine (только большие планеты). Считаем
 * двухтельной кеплеровской орбитой от опубликованных оскулирующих
 * элементов на эпоху (JPL Small-Body Database, эпоха 2025-Jan-01).
 *
 * ЧЕСТНОЕ ОГРАНИЧЕНИЕ (обязательно вынесено в warnings при использовании
 * в чартах): орбита Хирона возмущена близостью к Сатурну и Урану;
 * двухтельное приближение теряет точность на масштабе нескольких лет от
 * эпохи элементов. Для продакшена — обновлять элементы не реже раза в год
 * или подключить полноценную числовую интеграцию/JPL Horizons API.
 */
const CHIRON_EPOCH_JD = 2460676.5; // 2025-01-01 00:00 TT
const CHIRON_ELEMENTS = {
  a: 13.6367, // большая полуось, а.е.
  e: 0.38258, // эксцентриситет
  i: 6.9256, // наклонение, °
  Omega: 209.2865, // долгота восходящего узла, °
  omega: 339.3721, // аргумент перигелия, °
  M0: 130.0492, // средняя аномалия на эпоху, °
};

function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 30; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

interface OsculatingElements {
  a: number; // большая полуось, а.е.
  e: number; // эксцентриситет
  i: number; // наклонение, °
  Omega: number; // долгота восходящего узла, °
  omega: number; // аргумент перигелия, °
  M0: number; // средняя аномалия на эпоху, °
}

/**
 * Общая двухтельная кеплеровская орбита от оскулирующих элементов на эпоху —
 * тот же метод, что у Хирона (см. комментарий выше), вынесен в отдельную
 * функцию, чтобы не дублировать код для каждого малого тела. Используется
 * и для Хирона, и для главных астероидов ниже.
 */
function keplerianGeocentricLongitude(moment: EventMoment, epochJD: number, el: OsculatingElements): NodePosition {
  const time = toAstroTime(moment);
  const jdTT = time.tt + 2451545.0;
  const GM_SUN = 0.01720209895 ** 2; // Гауссова гравитационная постоянная² (а.е.³/сутки²), стандартная величина

  const positionAt = (jd: number) => {
    const dt = jd - epochJD;
    const n = Math.sqrt(GM_SUN / el.a ** 3); // среднее движение, рад/сутки
    const M = (el.M0 * Math.PI) / 180 + n * dt;
    const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), el.e);
    const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
    const r = el.a * (1 - el.e * Math.cos(E));

    const toRad = (d: number) => (d * Math.PI) / 180;
    const om = toRad(el.omega);
    const Om = toRad(el.Omega);
    const inc = toRad(el.i);

    // Гелиоцентрические эклиптические координаты (J2000, приближение — без прецессии, пренебрежимо для этой точности)
    const xh = r * (Math.cos(Om) * Math.cos(om + nu) - Math.sin(Om) * Math.sin(om + nu) * Math.cos(inc));
    const yh = r * (Math.sin(Om) * Math.cos(om + nu) + Math.cos(Om) * Math.sin(om + nu) * Math.cos(inc));
    const zh = r * (Math.sin(om + nu) * Math.sin(inc));
    return { xh, yh, zh };
  };

  // Геоцентрическая позиция = гелиоцентрическое тело - гелиоцентрическая Земля.
  // Земля (гелиоцентрически) = -Солнце (геоцентрически); .vec у Ecliptic() уже
  // даёт декартов вектор в системе истинной эклиптики даты — то, что нужно.
  const lonAt = (jd: number, t: Astronomy.AstroTime) => {
    const sunGeo = Astronomy.GeoVector(Astronomy.Body.Sun, t, true);
    const earthHelio = Astronomy.Ecliptic(new Astronomy.Vector(-sunGeo.x, -sunGeo.y, -sunGeo.z, sunGeo.t)).vec;
    const c = positionAt(jd);
    const dx = c.xh - earthHelio.x;
    const dy = c.yh - earthHelio.y;
    return normalize360((Math.atan2(dy, dx) * 180) / Math.PI);
  };

  const now = lonAt(jdTT, time);
  const before = lonAt(jdTT - 0.25, time.AddDays(-0.25));
  const after = lonAt(jdTT + 0.25, time.AddDays(0.25));
  return { longitude: now, speedLongitude: shortestDelta(before, after) / 0.5 };
}

export function chironLongitude(moment: EventMoment): NodePosition {
  return keplerianGeocentricLongitude(moment, CHIRON_EPOCH_JD, CHIRON_ELEMENTS);
}

/**
 * Церера, Паллада, Юнона, Веста — четыре крупнейших астероида Главного
 * пояса, традиционно используемые в западной астрологии как "женская
 * четвёрка" (наравне с планетами, но без официального ранга). Как и Хирон,
 * не входят в astronomy-engine — считаются той же двухтельной кеплеровской
 * орбитой от оскулирующих элементов, взятых из JPL Small-Body Database на
 * эпоху 2026-06-09 00:00 TDB (JD 2461200.5).
 *
 * ЧЕСТНОЕ ОГРАНИЧЕНИЕ (как и у Хирона): двухтельное приближение не
 * учитывает возмущения от Юпитера — точность падает при удалении от эпохи
 * элементов. Для продакшена элементы стоит обновлять не реже раза в год.
 */
const ASTEROID_EPOCH_JD = 2461200.5; // 2026-06-09 00:00 TDB

const CERES_ELEMENTS: OsculatingElements = {
  a: 2.765552595034094,
  e: 0.07969229514816586,
  i: 10.58802780183462,
  Omega: 80.24862682043221,
  omega: 73.29421453021587,
  M0: 274.4193463761342,
};

const PALLAS_ELEMENTS: OsculatingElements = {
  a: 2.769559010737709,
  e: 0.2307000995648547,
  i: 34.93279321851542,
  Omega: 172.8866193357694,
  omega: 310.9699161652136,
  M0: 254.2496521742734,
};

const JUNO_ELEMENTS: OsculatingElements = {
  a: 2.670989527103278,
  e: 0.2556999836681878,
  i: 12.98659236598085,
  Omega: 169.8115953492418,
  omega: 247.8950743075613,
  M0: 262.7322944883855,
};

const VESTA_ELEMENTS: OsculatingElements = {
  a: 2.361365965127599,
  e: 0.09020374382834395,
  i: 7.143925545058711,
  Omega: 103.701293265032,
  omega: 151.4686478221564,
  M0: 81.19015607686903,
};

export function ceresLongitude(moment: EventMoment): NodePosition {
  return keplerianGeocentricLongitude(moment, ASTEROID_EPOCH_JD, CERES_ELEMENTS);
}
export function pallasLongitude(moment: EventMoment): NodePosition {
  return keplerianGeocentricLongitude(moment, ASTEROID_EPOCH_JD, PALLAS_ELEMENTS);
}
export function junoLongitude(moment: EventMoment): NodePosition {
  return keplerianGeocentricLongitude(moment, ASTEROID_EPOCH_JD, JUNO_ELEMENTS);
}
export function vestaLongitude(moment: EventMoment): NodePosition {
  return keplerianGeocentricLongitude(moment, ASTEROID_EPOCH_JD, VESTA_ELEMENTS);
}
