/**
 * Слой 2: ASTROLOGICAL ENGINE — знаки и эссенциальные достоинства.
 * Публичные, общепринятые табличные данные (не расчёт, не интерпретация).
 */
import { EssentialDignity, PlanetName, ZODIAC_SIGNS, ZodiacSign } from '../types';

export function signOf(longitude: number): ZodiacSign {
  const idx = Math.floor(((longitude % 360) + 360) % 360 / 30);
  return ZODIAC_SIGNS[idx];
}

export function degreeInSign(longitude: number): number {
  return ((longitude % 360) + 360) % 360 % 30;
}

/** Классические (доуранические) управители — используются для достоинств традиционной астрологии */
const TRADITIONAL_RULERS: Record<ZodiacSign, PlanetName> = {
  Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon', Leo: 'Sun',
  Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars', Sagittarius: 'Jupiter',
  Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter',
};

/** Современные управители (Уран/Нептун/Плутон как со-управители Водолея/Рыб/Скорпиона) */
const MODERN_RULERS: Partial<Record<ZodiacSign, PlanetName>> = {
  Scorpio: 'Pluto', Aquarius: 'Uranus', Pisces: 'Neptune',
};

const EXALTATIONS: Partial<Record<ZodiacSign, PlanetName>> = {
  Aries: 'Sun', Taurus: 'Moon', Cancer: 'Jupiter', Virgo: 'Mercury',
  Libra: 'Saturn', Capricorn: 'Mars', Pisces: 'Venus',
};

function opposite(sign: ZodiacSign): ZodiacSign {
  const idx = ZODIAC_SIGNS.indexOf(sign);
  return ZODIAC_SIGNS[(idx + 6) % 12];
}

export interface DignityOptions {
  useModernRulers: boolean;
}

export function essentialDignity(planet: PlanetName, longitude: number, options: DignityOptions = { useModernRulers: true }): EssentialDignity {
  const sign = signOf(longitude);
  const traditionalRuler = TRADITIONAL_RULERS[sign];
  const modernRuler = MODERN_RULERS[sign];
  const ruler = options.useModernRulers && modernRuler ? modernRuler : traditionalRuler;

  const rulership = planet === ruler || planet === traditionalRuler;
  const exaltation = EXALTATIONS[sign] === planet;

  const detrimentSign = opposite(sign);
  const detrimentRuler = options.useModernRulers && MODERN_RULERS[detrimentSign] ? MODERN_RULERS[detrimentSign] : TRADITIONAL_RULERS[detrimentSign];
  const detriment = planet === detrimentRuler;

  // Падение — планета в знаке, противоположном её экзальтации
  const fallSign = (Object.keys(EXALTATIONS) as ZodiacSign[]).find((s) => EXALTATIONS[s] === planet);
  const fall = fallSign ? opposite(fallSign) === sign : false;

  const score = (rulership ? 5 : 0) + (exaltation ? 4 : 0) - (detriment ? 5 : 0) - (fall ? 4 : 0);

  return { rulership, exaltation, detriment, fall, score };
}
