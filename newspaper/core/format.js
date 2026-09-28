/**
 * ============================================================================
 *  core/format.js – Deutsche Zahlen- und Datumsformatierung
 * ============================================================================
 *
 *  Zweck:
 *    Alle Funktionen, die Zahlen, Einheiten und Datumsangaben in lesbares
 *    Deutsch verwandeln: „7,2 kW“, „21,5 °C“, „übermorgen“, „am Dienstag“,
 *    „in 8 Tagen“, „Montag, 28. September 2026“.
 *
 *  Abhängigkeiten:
 *    Keine. Bewusst ohne eigene Importe (siehe README, Abschnitt
 *    „Cache-Busting“): Das Panel lädt dieses Modul und reicht es über
 *    `ctx.fmt` an die Rubriken weiter.
 *
 *  Typische Anpassungen:
 *    - Andere Sprache/Region: LOCALE ändern (✏️ ANPASSEN)
 *    - Andere Schreibweise relativer Tage: relDay() / relDayShort()
 *    - Andere Einheiten-Darstellung: temp(), percent(), power()
 * ============================================================================
 */

// ✏️ ANPASSEN: Sprache/Region für Zahlen und Datumsangaben
export const LOCALE = 'de-DE';

// Geschütztes Leerzeichen: verhindert, dass „21,5“ und „°C“ auf zwei Zeilen landen.
const NBSP = ' ';

// Zwischenspeicher für Intl.NumberFormat-Objekte – deren Erzeugung ist
// vergleichsweise teuer, und wir brauchen immer dieselben paar Varianten.
const numberFormats = new Map();

// Datumsformate einmalig anlegen (gleicher Grund wie oben).
const F_LONG = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const F_WEEKDAY = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' });
const F_WEEKDAY_SHORT = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const F_DAY_MONTH = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const F_TIME = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

/* ---------------------------------------------------------------------------
 *  Zahlen
 * ------------------------------------------------------------------------- */

/**
 * Wandelt einen beliebigen Wert in eine Zahl um oder liefert null.
 * Akzeptiert auch Strings mit deutschem Komma.
 *
 * @param {*} value  Zahl, String oder sonstiges
 * @returns {number|null}  Zahl oder null, wenn nicht interpretierbar
 * @example toNumber('21,5') // → 21.5
 * @example toNumber('unavailable') // → null
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Formatiert eine Zahl deutsch (Komma, Tausenderpunkt).
 *
 * @param {*} value            Zahl oder Zahl-String
 * @param {number} [maxDigits=0] Maximale Nachkommastellen
 * @param {number} [minDigits=maxDigits] Minimale Nachkommastellen
 * @returns {string} Formatierte Zahl oder „–“ bei ungültigem Wert
 * @example number(7.234, 1) // → "7,2"
 * @example number(1234)     // → "1.234"
 */
export function number(value, maxDigits = 0, minDigits = maxDigits) {
  const n = toNumber(value);
  if (n === null) return '–';
  const key = `${minDigits}|${maxDigits}`;
  if (!numberFormats.has(key)) {
    numberFormats.set(key, new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    }));
  }
  // Werte wie -0,2 würden sonst als „-0“ erscheinen – das sieht falsch aus.
  const rounded = Number(n.toFixed(maxDigits));
  return numberFormats.get(key).format(rounded === 0 ? 0 : n);
}

/**
 * Temperatur mit Einheit.
 *
 * @param {*} value              Temperatur in °C
 * @param {number} [digits=0]    Nachkommastellen (innen gern 1, außen 0)
 * @returns {string} z. B. „21,5 °C“ oder „–“
 * @example temp(21.54, 1) // → "21,5 °C"
 */
export function temp(value, digits = 0) {
  return toNumber(value) === null ? '–' : `${number(value, digits)}${NBSP}°C`;
}

/**
 * Prozentwert mit Einheit (deutsche Schreibweise mit Leerzeichen).
 *
 * @param {*} value            Prozentzahl (0–100)
 * @param {number} [digits=0]  Nachkommastellen
 * @returns {string} z. B. „64 %“ oder „–“
 * @example percent(64.2) // → "64 %"
 */
export function percent(value, digits = 0) {
  return toNumber(value) === null ? '–' : `${number(value, digits)}${NBSP}%`;
}

/**
 * Leistung in kW, unter 1 kW automatisch in W.
 *
 * @param {*} kw  Leistung in Kilowatt
 * @returns {string} z. B. „7,2 kW“, „450 W“ oder „–“
 * @example power(7.23) // → "7,2 kW"
 * @example power(0.45) // → "450 W"
 */
export function power(kw) {
  const n = toNumber(kw);
  if (n === null) return '–';
  return Math.abs(n) < 1 ? `${number(n * 1000, 0)}${NBSP}W` : `${number(n, 1)}${NBSP}kW`;
}

/**
 * Geschwindigkeit in km/h.
 *
 * @param {*} kmh  Wert in km/h
 * @returns {string} z. B. „54 km/h“
 * @example speed(53.6) // → "54 km/h"
 */
export function speed(kmh) {
  return toNumber(kmh) === null ? '–' : `${number(kmh, 0)}${NBSP}km/h`;
}

/* ---------------------------------------------------------------------------
 *  Datum & Uhrzeit
 * ------------------------------------------------------------------------- */

/**
 * Wandelt einen Wert (Date, ISO-String, Zeitstempel) in ein Date um.
 *
 * @param {*} value
 * @returns {Date|null}  Gültiges Datum oder null
 * @example toDate('2026-09-28T18:00:00+02:00') // → Date
 */
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Tagesbeginn (00:00 Uhr lokaler Zeit) eines Datums.
 *
 * @param {Date} date
 * @returns {Date}
 * @example startOfDay(new Date(2026, 8, 28, 14, 3)) // → 28.09.2026 00:00
 */
export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Addiert Kalendertage (sommerzeitsicher, weil über setDate statt Millisekunden).
 *
 * @param {Date} date
 * @param {number} days  Anzahl Tage (auch negativ)
 * @returns {Date} Neues Datum
 * @example addDays(new Date(2026, 8, 28), 3) // → 01.10.2026
 */
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Anzahl Kalendertage zwischen zwei Daten (Uhrzeit wird ignoriert).
 * Math.round fängt die 23-/25-Stunden-Tage der Zeitumstellung ab.
 *
 * @param {Date} from
 * @param {Date} to
 * @returns {number}  positiv, wenn `to` in der Zukunft liegt
 * @example daysBetween(heute, morgen) // → 1
 */
export function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86400000);
}

/**
 * Tag des Jahres (1–366) – wird als „Ausgabe Nr.“ verwendet.
 *
 * @param {Date} date
 * @returns {number}
 * @example dayOfYear(new Date(2026, 8, 28)) // → 271
 */
export function dayOfYear(date) {
  return daysBetween(new Date(date.getFullYear(), 0, 1), date) + 1;
}

/**
 * Wochentag nach ISO (Montag = 1 … Sonntag = 7).
 *
 * @param {Date} date
 * @returns {number}
 * @example isoWeekday(new Date(2026, 8, 28)) // → 1 (Montag)
 */
export function isoWeekday(date) {
  return date.getDay() || 7;
}

/**
 * Ausgeschriebenes Datum für den Zeitungskopf.
 *
 * @param {Date} date
 * @returns {string} z. B. „Montag, 28. September 2026“
 */
export function dateLong(date) {
  return F_LONG.format(date);
}

/**
 * Ausgeschriebener Wochentag.
 *
 * @param {Date} date
 * @returns {string} z. B. „Dienstag“
 */
export function weekday(date) {
  return F_WEEKDAY.format(date);
}

/**
 * Uhrzeit mit „Uhr“.
 *
 * @param {Date} date
 * @returns {string} z. B. „18:30 Uhr“ oder „–“
 */
export function time(date) {
  const d = toDate(date);
  return d ? `${F_TIME.format(d)}${NBSP}Uhr` : '–';
}

/**
 * Relativer Tag für Fließtext.
 *
 * @param {number} days  Abstand in Tagen (0 = heute)
 * @param {Date} [now=new Date()]  Bezugszeitpunkt (für Wochentage)
 * @returns {string}
 * @example relDay(0) // → "heute"
 * @example relDay(2) // → "übermorgen"
 * @example relDay(4) // → "am Freitag"   (wenn heute Montag ist)
 * @example relDay(9) // → "in 9 Tagen"
 */
export function relDay(days, now = new Date()) {
  // ✏️ ANPASSEN: Formulierungen für relative Tage
  if (days === -1) return 'gestern';
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days === 2) return 'übermorgen';
  if (days >= 3 && days <= 6) return `am ${weekday(addDays(now, days))}`;
  if (days >= 7) return `in ${days} Tagen`;
  return `vor ${-days} Tagen`;
}

/**
 * Kurzform eines relativen Tages für Tabellen und Listen.
 *
 * @param {number} days  Abstand in Tagen
 * @param {Date} [now=new Date()]
 * @returns {string}
 * @example relDayShort(1) // → "morgen"
 * @example relDayShort(4) // → "Fr."
 * @example relDayShort(12) // → "10. Okt."
 */
export function relDayShort(days, now = new Date()) {
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days === 2) return 'übermorgen';
  const date = addDays(now, days);
  if (days >= 3 && days <= 6) return F_WEEKDAY_SHORT.format(date);
  return F_DAY_MONTH.format(date);
}
