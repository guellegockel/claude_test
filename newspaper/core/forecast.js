/**
 * ============================================================================
 *  core/forecast.js – Wettervorhersage per WebSocket-Abo
 * ============================================================================
 *
 *  Zweck:
 *    Seit HA 2024.3 stehen Vorhersagen nicht mehr in den Attributen der
 *    weather-Entität. Stattdessen abonniert man sie mit
 *    `weather/subscribe_forecast`. Diese Klasse verwaltet die Abos für alle
 *    Rubriken zentral, speichert die letzten Daten und beendet die Abos
 *    sauber, wenn das Panel entfernt wird.
 *
 *    Rubriken melden ihren Bedarf deklarativ über
 *    `getForecasts(cfg) → [{ entity_id, type: 'daily' | 'hourly' | 'twice_daily' }]`
 *    und lesen die Daten mit `ctx.forecast(entityId, type)`.
 *
 *  Abhängigkeiten:
 *    Keine. Wird von newspaper-panel.js erzeugt.
 *
 *  Typische Anpassungen:
 *    - Wartezeit vor erneutem Versuch nach Fehler: RETRY_MS
 * ============================================================================
 */

// Nach einem fehlgeschlagenen Abo (z. B. Integration liefert keine
// Vorhersage) erst nach dieser Zeit erneut versuchen – sonst würde bei jedem
// hass-Update (mehrmals pro Sekunde) ein neuer Versuch gestartet.
const RETRY_MS = 5 * 60 * 1000;

export class ForecastStore {
  /**
   * @param {() => void} onChange  Wird aufgerufen, wenn neue Vorhersagedaten eintreffen
   */
  constructor(onChange) {
    this._onChange = onChange;
    this._subs = new Map();     // key → Promise<unsubscribe-Funktion>
    this._data = new Map();     // key → Array der Vorhersage-Einträge
    this._failedAt = new Map(); // key → Zeitpunkt des letzten Fehlers
  }

  /**
   * Schlüssel aus Entität und Vorhersage-Typ.
   *
   * @param {string} entityId
   * @param {string} type
   * @returns {string}
   */
  static key(entityId, type) {
    return `${entityId}|${type}`;
  }

  /**
   * Stellt sicher, dass alle gewünschten Abos bestehen. Wird bei jedem
   * hass-Update aufgerufen, ist aber billig: bestehende Abos werden
   * übersprungen. Nicht existierende Entitäten (z. B. Platzhalter) werden
   * ignoriert und automatisch abonniert, sobald sie auftauchen.
   *
   * Hinweis: Bricht die WebSocket-Verbindung ab, stellt die HA-Bibliothek
   * die Abos nach dem Wiederverbinden selbst wieder her.
   *
   * @param {object} hass
   * @param {Array<{entity_id: string, type: string}>} wanted
   * @returns {void}
   * @example store.sync(hass, [{ entity_id: 'weather.home', type: 'daily' }])
   */
  sync(hass, wanted) {
    if (!hass?.connection) return;
    for (const { entity_id: entityId, type } of wanted) {
      const key = ForecastStore.key(entityId, type);
      if (this._subs.has(key)) continue;
      if (!hass.states?.[entityId]) continue;
      const failedAt = this._failedAt.get(key);
      if (failedAt && Date.now() - failedAt < RETRY_MS) continue;

      const promise = hass.connection.subscribeMessage(
        (event) => {
          this._data.set(key, Array.isArray(event?.forecast) ? event.forecast : null);
          this._onChange();
        },
        { type: 'weather/subscribe_forecast', entity_id: entityId, forecast_type: type },
      );
      this._subs.set(key, promise);
      promise.catch((err) => {
        console.warn(`[Hauszeitung] Vorhersage für ${entityId} (${type}) nicht abonnierbar:`, err?.message ?? err);
        this._subs.delete(key);
        this._failedAt.set(key, Date.now());
      });
    }
  }

  /**
   * Letzte bekannte Vorhersage.
   *
   * @param {string} entityId
   * @param {string} [type='daily']
   * @returns {Array<object>|null}  Einträge mit datetime, temperature, templow, condition …
   */
  get(entityId, type = 'daily') {
    return this._data.get(ForecastStore.key(entityId, type)) ?? null;
  }

  /**
   * Beendet alle Abos (beim Entfernen des Panels). Danach kann sync()
   * die Abos erneut anlegen, falls das Panel wieder eingehängt wird.
   *
   * @returns {void}
   */
  dispose() {
    for (const promise of this._subs.values()) {
      promise.then((unsubscribe) => unsubscribe()).catch(() => { /* bereits beendet */ });
    }
    this._subs.clear();
    this._failedAt.clear();
  }
}
