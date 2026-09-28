/**
 * ============================================================================
 *  core/text-engine.js – Textbaustein-System der Hauszeitung
 * ============================================================================
 *
 *  Zweck:
 *    Macht aus Textbausteinen in config.js fertige, grammatisch korrekte
 *    Sätze. Unterstützt:
 *      - Platzhalter:               „Draußen sind es {temp}.“
 *      - Großschreibung am Satzanfang: {Tonne} → Wert von `tonne`, erster
 *                                      Buchstabe groß („Die Biotonne …“)
 *      - Singular/Plural:           „in {n} {n:Tag|Tagen}“
 *      - Mehrere Varianten je Situation (Array in config.js) – pro Tag wird
 *        stabil eine gewählt, damit der Text nicht bei jedem Update springt.
 *      - Artikel/Fälle für Nomen:   noun({name:'Biotonne', genus:'f'}, 'akk')
 *      - Aufzählungen:              list(['a','b','c']) → „a, b und c“
 *
 *  Sicherheit:
 *    Werte aus Home Assistant werden beim Einsetzen HTML-maskiert (esc).
 *    Der Baustein selbst darf einfaches HTML enthalten (<strong> …).
 *    Soll ein Wert bewusst HTML sein (z. B. ein Inline-Schalter), wird er
 *    mit raw(html) markiert. Das Ergebnis von say()/fill() ist HTML – wer es
 *    in einen weiteren Baustein einsetzt, muss es daher mit raw() umhüllen.
 *
 *  Abhängigkeiten:
 *    Keine (siehe README, „Cache-Busting“). Die Rubriken erhalten dieses
 *    Modul über `ctx.text`.
 *
 *  Typische Anpassungen:
 *    - Weitere Artikel/Fälle: Tabelle ARTICLES
 *    - Andere Verknüpfung für Aufzählungen: list(items, 'oder')
 * ============================================================================
 */

// Platzhalter-Muster: {name} oder {name:Singular|Plural}.
// \w kennt in JavaScript keine Umlaute, deshalb sind sie explizit ergänzt.
const PLACEHOLDER = /\{([A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß]*)(?::([^|{}]*)\|([^{}]*))?\}/g;

// Inline-Schalter samt direkt angrenzender Zeichen (z. B. ›{modus}‹).
// [^\s<>] verhindert, dass benachbarte HTML-Tags mit eingefangen werden.
const INLINE_CONTROL = /[^\s<>]*<(np-inline-[a-z]+)\b[^>]*><\/\1>[^\s<>]*/g;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Bestimmte und unbestimmte Artikel je Fall (nom/akk/dat/gen) und Genus
// (m = maskulin, f = feminin, n = neutrum, pl = Plural).
const ARTICLES = {
  def: {
    nom: { m: 'der', f: 'die', n: 'das', pl: 'die' },
    akk: { m: 'den', f: 'die', n: 'das', pl: 'die' },
    dat: { m: 'dem', f: 'der', n: 'dem', pl: 'den' },
    gen: { m: 'des', f: 'der', n: 'des', pl: 'der' },
  },
  indef: {
    nom: { m: 'ein', f: 'eine', n: 'ein', pl: '' },
    akk: { m: 'einen', f: 'eine', n: 'ein', pl: '' },
    dat: { m: 'einem', f: 'einer', n: 'einem', pl: '' },
    gen: { m: 'eines', f: 'einer', n: 'eines', pl: '' },
  },
};

// Jede Warnung nur einmal in die Konsole schreiben – sonst würde sie bei
// jedem Neuzeichnen (mind. einmal pro Minute) wiederholt.
const warned = new Set();
function warnOnce(message) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[Hauszeitung] ${message}`);
}

/**
 * Maskiert HTML-Sonderzeichen.
 *
 * @param {*} value  Beliebiger Wert
 * @returns {string} HTML-sicherer Text
 * @example esc('<b>') // → "&lt;b&gt;"
 */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Markiert einen String als fertiges HTML, das beim Einsetzen NICHT
 * maskiert werden soll (z. B. Inline-Schalter oder verschachtelte Bausteine).
 *
 * @param {string} html
 * @returns {{__raw: string}}
 * @example fill('Modus ›{m}‹', { m: raw('<np-inline-select …>') })
 */
export function raw(html) {
  return { __raw: String(html ?? '') };
}

/**
 * Prüft, ob ein Wert mit raw() markiert wurde.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isRaw(value) {
  return value !== null && typeof value === 'object' && '__raw' in value;
}

/**
 * Erster Buchstabe groß.
 *
 * @param {string} text
 * @returns {string}
 * @example ucfirst('die Biotonne') // → "Die Biotonne"
 */
export function ucfirst(text) {
  const s = String(text ?? '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Wie ucfirst, überspringt aber führende HTML-Tags und Leerzeichen.
 *
 * @param {string} html
 * @returns {string}
 * @example ucfirstHtml('<em>die</em> Tonne') // → "<em>Die</em> Tonne"
 */
function ucfirstHtml(html) {
  return html.replace(/^((?:<[^>]*>|\s)*)(\p{Ll})/u, (m, pre, ch) => pre + ch.toUpperCase());
}

/**
 * Sucht einen Platzhalter in den Variablen. Ist `{Tonne}` nicht belegt,
 * wohl aber `tonne`, wird dessen Wert mit großem Anfangsbuchstaben genutzt.
 *
 * @param {object} vars
 * @param {string} name
 * @returns {{value: *, capitalize: boolean}|null}
 */
function lookup(vars, name) {
  if (Object.prototype.hasOwnProperty.call(vars, name)) return { value: vars[name], capitalize: false };
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  if (lower !== name && Object.prototype.hasOwnProperty.call(vars, lower)) {
    return { value: vars[lower], capitalize: true };
  }
  return null;
}

/**
 * Setzt einen einzelnen Wert als HTML ein.
 *
 * @param {*} value
 * @param {boolean} capitalize
 * @returns {string}
 */
function renderValue(value, capitalize) {
  if (isRaw(value)) return capitalize ? ucfirstHtml(value.__raw) : value.__raw;
  if (value === null || value === undefined) return '–';
  let s = typeof value === 'number' ? value.toLocaleString('de-DE') : String(value);
  if (capitalize) s = ucfirst(s);
  return esc(s);
}

/**
 * Füllt einen Textbaustein mit Werten.
 *
 * Unbekannte Platzhalter bleiben sichtbar stehen (z. B. „{tmep}“), damit
 * Tippfehler in config.js sofort auffallen – und es gibt eine Konsolenwarnung.
 *
 * @param {string} template  Baustein, z. B. „Morgen {kommt} {tonne}.“
 * @param {object} [vars={}] Werte für die Platzhalter
 * @returns {string} HTML
 * @example fill('{Tonne} {kommt} {wann}.', { tonne: 'die Biotonne', kommt: 'kommt', wann: 'morgen' })
 *          // → "Die Biotonne kommt morgen."
 * @example fill('in {n} {n:Tag|Tagen}', { n: 1 }) // → "in 1 Tag"
 */
export function fill(template, vars = {}) {
  if (template === null || template === undefined) return '';
  const html = String(template).replace(PLACEHOLDER, (match, name, singular, plural) => {
    const found = lookup(vars, name);
    if (!found) {
      warnOnce(`Platzhalter ${match} ist nicht belegt.`);
      return match;
    }
    if (singular !== undefined) {
      // Singular nur bei genau 1 (bzw. -1); 0 und alles andere → Plural.
      const n = Number(isRaw(found.value) ? NaN : found.value);
      return Math.abs(n) === 1 ? singular : plural;
    }
    return renderValue(found.value, found.capitalize);
  });
  // Browser dürfen direkt vor einem Custom Element umbrechen – dann stünde
  // „›“ am Zeilenende und „Smart‹“ in der nächsten Zeile. Die Klammer
  // .np-nowrap hält Anführungszeichen und Schalter zusammen.
  return html.replace(INLINE_CONTROL, (m) => `<span class="np-nowrap">${m}</span>`);
}

/**
 * Einfacher, stabiler Hash (für die Auswahl einer Formulierungsvariante).
 *
 * @param {string} str
 * @returns {number}
 */
function hash(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/**
 * Wählt aus mehreren Formulierungsvarianten eine aus – deterministisch
 * anhand des `seed`. Gleicher Seed → gleiche Variante.
 *
 * @param {string|string[]} variants  Einzelner Text oder Liste von Varianten
 * @param {string} [seed='']
 * @returns {string}
 * @example pick(['A', 'B', 'C'], 'waste.tomorrow|2026-09-28') // → immer dieselbe
 */
export function pick(variants, seed = '') {
  if (!Array.isArray(variants)) return variants;
  if (variants.length === 0) return '';
  return variants[hash(seed) % variants.length];
}

/**
 * Tages-Schlüssel „JJJJ-M-T“ – die Variantenwahl wechselt so einmal am Tag.
 *
 * @param {Date} date
 * @returns {string}
 */
function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Holt einen Baustein aus einem Text-Objekt (Pfad mit Punkten), wählt eine
 * Variante und füllt die Platzhalter. Das ist die Hauptfunktion für Rubriken.
 *
 * @param {object} texts       Text-Objekt der Rubrik (aus config.js)
 * @param {string} key         Pfad, z. B. 'tomorrow' oder 'headlines.full'
 * @param {object} [vars={}]   Platzhalter-Werte
 * @param {Date} [now=new Date()] Für die tägliche Variantenwahl
 * @returns {string} HTML (leer, wenn der Baustein fehlt)
 * @example say(cfg.texts, 'tomorrow', { tonne: 'die Biotonne', wird: 'wird' })
 */
export function say(texts, key, vars = {}, now = new Date()) {
  const entry = String(key).split('.').reduce((obj, k) => (obj == null ? obj : obj[k]), texts);
  if (entry === null || entry === undefined) {
    warnOnce(`Textbaustein „${key}“ fehlt in config.js.`);
    return '';
  }
  return fill(pick(entry, `${key}|${dayKey(now)}`), vars);
}

/**
 * Nomen mit Artikel im gewünschten Fall.
 *
 * Für Wörter mit Adjektiv („der Gelbe Sack“ → „den Gelben Sack“) können in
 * config.js die fertigen Formen hinterlegt werden: forms: { nom, akk, dat }.
 *
 * @param {{name: string, genus?: 'm'|'f'|'n'|'pl', forms?: object}} item
 * @param {'nom'|'akk'|'dat'|'gen'} [kase='nom']  Grammatischer Fall
 * @param {boolean} [definite=true]  bestimmter (der/die/das) oder unbestimmter Artikel
 * @returns {string}
 * @example noun({ name: 'Biotonne', genus: 'f' })          // → "die Biotonne"
 * @example noun({ name: 'Restmüll', genus: 'm' }, 'dat')   // → "dem Restmüll"
 */
export function noun(item, kase = 'nom', definite = true) {
  if (!item) return '';
  if (definite && item.forms && item.forms[kase]) return item.forms[kase];
  const article = ARTICLES[definite ? 'def' : 'indef'][kase]?.[item.genus || 'f'];
  return article ? `${article} ${item.name}` : String(item.name ?? '');
}

/**
 * Deutsche Aufzählung.
 *
 * @param {string[]} items
 * @param {string} [conjunction='und']
 * @returns {string}
 * @example list(['die Biotonne', 'das Altpapier', 'der Restmüll'])
 *          // → "die Biotonne, das Altpapier und der Restmüll"
 */
export function list(items, conjunction = 'und') {
  const xs = (items || []).filter((x) => x !== null && x !== undefined && x !== '');
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} ${conjunction} ${xs[xs.length - 1]}`;
}

/**
 * Wählt Singular- oder Pluralform eines Verbs passend zu einer Nomenliste.
 *
 * @param {Array<{genus?: string}>} items  Nomen (z. B. Tonnen)
 * @param {string} singular  z. B. „wird“
 * @param {string} plural    z. B. „werden“
 * @returns {string}
 * @example agree([bio], 'wird', 'werden')        // → "wird"
 * @example agree([bio, papier], 'wird', 'werden') // → "werden"
 */
export function agree(items, singular, plural) {
  const xs = items || [];
  const isPlural = xs.length > 1 || (xs.length === 1 && xs[0]?.genus === 'pl');
  return isPlural ? plural : singular;
}
