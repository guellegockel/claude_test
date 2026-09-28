/**
 * ============================================================================
 *  core/entities.js – Sicherer Zugriff auf Home-Assistant-Zustände
 * ============================================================================
 *
 *  Zweck:
 *    Alle Lesezugriffe auf `hass.states` laufen hier durch. Fehlende
 *    Entitäten sowie `unavailable`/`unknown` werden einheitlich zu `null` –
 *    die Rubriken müssen dann nur noch „null → Ersatztext“ behandeln und
 *    stürzen nie wegen einer ausgefallenen Entität ab.
 *
 *    Außerdem: changed() – der Vergleich, der entscheidet, ob das Panel
 *    überhaupt neu gezeichnet werden muss.
 *
 *  Abhängigkeiten:
 *    Keine. Rubriken erhalten dieses Modul über `ctx.ent`.
 *
 *  Typische Anpassungen:
 *    - Weitere „ungültige“ Zustände: INVALID_STATES
 *    - Weitere „An“-Zustände (z. B. 'charging'): ON_STATES
 * ============================================================================
 */

// ✏️ ANPASSEN: Zustände, die als „kein Messwert“ gelten
const INVALID_STATES = new Set(['unavailable', 'unknown', 'none', 'null', '']);

// ✏️ ANPASSEN: Zustände, die als „an/wahr“ gelten (für isOn)
const ON_STATES = new Set(['on', 'true', 'home', 'open', 'charging', 'connected', '1', 'yes']);
const OFF_STATES = new Set(['off', 'false', 'not_home', 'closed', 'disconnected', '0', 'no']);

/**
 * Erkennt Platzhalter-IDs aus config.js (enthalten „PLATZHALTER“).
 *
 * @param {string} entityId
 * @returns {boolean} true, wenn leer oder noch nicht eingetragen
 * @example isPlaceholder('sensor.PLATZHALTER_bad_temperatur') // → true
 */
export function isPlaceholder(entityId) {
  return !entityId || /PLATZHALTER/i.test(entityId);
}

/**
 * Ist eine Entität „eingerichtet“? Ja, wenn die ID kein Platzhalter ist –
 * oder wenn es eine Entität dieses Namens tatsächlich gibt.
 *
 * @param {object} hass
 * @param {string} entityId
 * @returns {boolean}
 * @example isConfigured(hass, 'sensor.PLATZHALTER_bad') // → false
 * @example isConfigured(hass, 'sensor.bad_temperatur')  // → true
 */
export function isConfigured(hass, entityId) {
  return Boolean(entityId) && (!isPlaceholder(entityId) || Boolean(hass?.states?.[entityId]));
}

/**
 * Domäne einer Entity-ID.
 *
 * @param {string} entityId
 * @returns {string}
 * @example domain('light.flur') // → "light"
 */
export function domain(entityId) {
  return String(entityId || '').split('.')[0];
}

/**
 * Rohes State-Objekt (auch wenn unavailable) oder null, falls nicht vorhanden.
 *
 * @param {object} hass
 * @param {string} entityId
 * @returns {object|null}
 */
export function stateObj(hass, entityId) {
  if (!hass || !hass.states || !entityId) return null;
  return hass.states[entityId] ?? null;
}

/**
 * Existiert die Entität überhaupt (egal in welchem Zustand)?
 *
 * @param {object} hass
 * @param {string} entityId
 * @returns {boolean}
 */
export function exists(hass, entityId) {
  return stateObj(hass, entityId) !== null;
}

/**
 * State-Objekt nur, wenn die Entität existiert UND einen gültigen Zustand hat.
 *
 * @param {object} hass
 * @param {string} entityId
 * @returns {object|null}
 * @example valid(hass, 'weather.home')?.attributes.temperature
 */
export function valid(hass, entityId) {
  const s = stateObj(hass, entityId);
  if (!s) return null;
  return INVALID_STATES.has(String(s.state).toLowerCase()) ? null : s;
}

/**
 * Zustand als String oder null.
 *
 * @param {object} hass
 * @param {string} entityId
 * @returns {string|null}
 * @example state(hass, 'sun.sun') // → "below_horizon"
 */
export function state(hass, entityId) {
  return valid(hass, entityId)?.state ?? null;
}

/**
 * Zustand als Zahl oder null.
 *
 * @param {object} hass
 * @param {string} entityId
 * @returns {number|null}
 * @example num(hass, 'sensor.bad_temperatur') // → 22.4
 */
export function num(hass, entityId) {
  const s = state(hass, entityId);
  if (s === null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Attribut einer Entität oder null.
 *
 * @param {object} hass
 * @param {string} entityId
 * @param {string} name  Attributname
 * @returns {*|null}
 * @example attr(hass, 'select.evcc_mode', 'options') // → ['off','pv','minpv','now']
 */
export function attr(hass, entityId, name) {
  const value = stateObj(hass, entityId)?.attributes?.[name];
  return value === undefined ? null : value;
}

/**
 * Wahrheitswert eines Zustands.
 *
 * @param {object} hass
 * @param {string} entityId
 * @returns {boolean|null} true/false oder null, wenn unbekannt
 * @example isOn(hass, 'binary_sensor.evcc_connected') // → true
 */
export function isOn(hass, entityId) {
  const s = state(hass, entityId);
  if (s === null) return null;
  const v = s.toLowerCase();
  if (ON_STATES.has(v)) return true;
  if (OFF_STATES.has(v)) return false;
  return null;
}

/**
 * Leistung in kW – unabhängig davon, ob der Sensor W, kW oder MW liefert.
 *
 * @param {object} hass
 * @param {string} entityId
 * @returns {number|null}
 * @example powerKw(hass, 'sensor.evcc_pv_power') // 7200 W → 7.2
 */
export function powerKw(hass, entityId) {
  const value = num(hass, entityId);
  if (value === null) return null;
  const unit = String(attr(hass, entityId, 'unit_of_measurement') ?? '').trim();
  if (unit === 'kW') return value;
  if (unit === 'MW') return value * 1000;
  // 'W' oder fehlende Einheit: evcc liefert Leistungen in Watt.
  return value / 1000;
}

/**
 * Anzeigename (friendly_name) oder die ID als Ersatz.
 *
 * @param {object} hass
 * @param {string} entityId
 * @returns {string}
 */
export function friendlyName(hass, entityId) {
  return attr(hass, entityId, 'friendly_name') ?? entityId;
}

/**
 * Hat sich eine der beobachteten Entitäten zwischen zwei hass-Objekten
 * geändert?
 *
 * Warum ein Referenzvergleich genügt: Home Assistant ersetzt ein
 * State-Objekt nur, wenn sich Zustand oder Attribute wirklich ändern;
 * unveränderte Entitäten behalten dieselbe Objekt-Referenz. Der Vergleich
 * ist deshalb billig und trotzdem exakt.
 *
 * @param {object|null} prevHass  hass beim letzten Zeichnen
 * @param {object} nextHass       aktuelles hass
 * @param {Iterable<string>} entityIds  beobachtete Entitäten
 * @returns {boolean}
 */
export function changed(prevHass, nextHass, entityIds) {
  if (!prevHass) return true;
  for (const id of entityIds) {
    if (prevHass.states?.[id] !== nextHass.states?.[id]) return true;
  }
  return false;
}
