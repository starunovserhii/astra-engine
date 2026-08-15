/**
 * Слой 1: ASTRONOMICAL ENGINE — время.
 *
 * Всё, что связано с датой/временем, живёт здесь и нигде больше.
 * Астрологический слой (houses/aspects/charts) никогда не работает с
 * часовыми поясами напрямую — только с готовым UTC.
 */
import * as Astronomy from 'astronomy-engine';
import { EventMoment } from '../types';

export interface LocalBirthInput {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23, локальное время места рождения
  minute: number;
  second?: number;
  /**
   * Смещение локального времени от UTC в часах на момент события
   * (уже с учётом DST, если он действовал). Например Москва зимой = 3,
   * Нью-Йорк летом = -4.
   *
   * Сознательное архитектурное решение: движок НЕ хранит базу исторических
   * часовых поясов/DST-правил внутри себя (это отдельная, часто обновляемая
   * база — IANA tzdata). Конвертация "город + локальное время -> смещение"
   * происходит на уровне сервиса (LocationCache из проектного брифа ASTRA,
   * часть E), сюда приходит уже готовое смещение. Так ядро остаётся чистым
   * и не протухает при обновлениях tzdata.
   */
  utcOffsetHours: number;
  timeKnown: boolean;
}

/** Локальное время рождения -> точный момент в UTC */
export function toEventMoment(input: LocalBirthInput): EventMoment {
  const utcMillis = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour - Math.trunc(input.utcOffsetHours),
    input.minute - Math.round((input.utcOffsetHours % 1) * 60),
    input.second ?? 0,
  );
  return {
    utc: new Date(utcMillis),
    timeKnown: input.timeKnown,
  };
}

/** AstroTime astronomy-engine из нашего EventMoment */
export function toAstroTime(moment: EventMoment): Astronomy.AstroTime {
  return Astronomy.MakeTime(moment.utc);
}

/** Julian Day (UT) — для логов/воспроизводимости и для формул домов */
export function julianDayUT(moment: EventMoment): number {
  return toAstroTime(moment).ut + 2451545.0;
}

/** Greenwich Apparent Sidereal Time, часы (0-24) */
export function greenwichApparentSiderealTime(moment: EventMoment): number {
  return Astronomy.SiderealTime(toAstroTime(moment));
}

/** Local Apparent Sidereal Time, часы (0-24), для формул домов */
export function localApparentSiderealTime(moment: EventMoment, longitudeDeg: number): number {
  const gast = greenwichApparentSiderealTime(moment);
  const last = gast + longitudeDeg / 15;
  return ((last % 24) + 24) % 24;
}

/** Истинный наклон эклиптики на дату, градусы — нужен нескольким формулам домов и Vertex */
export function trueObliquity(moment: EventMoment): number {
  const t = toAstroTime(moment);
  const tilt = Astronomy.e_tilt(t);
  return tilt.tobl; // true obliquity, degrees
}
