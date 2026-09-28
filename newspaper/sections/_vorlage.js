/**
 * ============================================================================
 *  sections/_vorlage.js – KOPIERVORLAGE für eine neue Rubrik
 * ============================================================================
 *
 *  So entsteht eine neue Rubrik (Details: README, „Neue Rubrik hinzufügen“):
 *    1. Diese Datei kopieren, z. B. nach sections/waschmaschine.js
 *    2. `id` und `kicker` unten anpassen, Logik ausfüllen
 *    3. In config.js unter `sections` einen Eintrag ergänzen:
 *         {
 *           id: 'waschmaschine',
 *           module: './sections/waschmaschine.js',
 *           enabled: true,
 *           kicker: 'Waschküche',
 *           entity: 'sensor.waschmaschine_status',
 *           texts: {
 *             running: ['Die Waschmaschine läuft noch {rest}.'],
 *             done: ['Die Wäsche ist fertig und will aufgehängt werden.'],
 *             noData: ['Aus der Waschküche liegen keine Daten vor.'],
 *             headlines: { running: 'Waschgang läuft', done: 'Wäsche ist fertig', fallback: 'Waschküche' },
 *           },
 *         },
 *
 *  Was die Rubrik bekommt:
 *    hass – der HA-Zustand (nur lesen; nie direkt verändern)
 *    cfg  – ihr eigener Eintrag aus config.js (siehe oben)
 *    ctx  – Werkzeugkasten:
 *           ctx.now                 aktuelles Datum
 *           ctx.ent.valid/num/state/attr/isOn/powerKw/isConfigured
 *                                   sicherer Zugriff (null bei unavailable)
 *           ctx.fmt.temp/percent/power/number/relDay/time/…
 *                                   deutsche Formatierung
 *           ctx.say(cfg.texts, 'key', { … })
 *                                   Textbaustein → HTML
 *           ctx.text.noun/list/agree  Grammatik-Helfer
 *           ctx.esc(text), ctx.raw(html)
 *           ctx.ui.toggle/choice/inlineSelect/inlineToggle/optionsFrom
 *                                   Bedienelemente als HTML
 *           ctx.forecast(entity, type)  Wettervorhersage (mit getForecasts)
 *           ctx.config              gesamte config.js
 *
 *  Wichtig:
 *    - Diese Datei importiert NICHTS (Cache-Busting, siehe README).
 *    - Alles, was aus HA kommt, beim Einsetzen in HTML mit ctx.esc()
 *      maskieren – ctx.say() erledigt das für Platzhalter automatisch.
 *    - Fehlende Daten nie als Fehler werfen, sondern Ersatztext liefern.
 *
 *  Abhängigkeiten: keine.
 *  Typische Anpassungen: alles in dieser Datei 😉
 * ============================================================================
 */

/**
 * Liest die Daten der Rubrik aus. Ein zentraler Ort, damit Priorität,
 * Artikel und Faktenbox dieselbe Sicht haben.
 *
 * @param {object} hass
 * @param {object} cfg
 * @param {object} ctx
 * @returns {{status: string, value: string|null}}
 */
function analyse(hass, cfg, ctx) {
  const value = ctx.ent.state(hass, cfg.entity); // null bei fehlend/unavailable
  let status = 'noData';
  // ✏️ ANPASSEN: Zustände deiner Entität auf Situationen abbilden
  if (value === 'running') status = 'running';
  else if (value === 'done') status = 'done';
  return { status, value };
}

export default {
  // ✏️ ANPASSEN: eindeutige Kennung und Standard-Dachzeile
  id: 'vorlage',
  kicker: 'Vorlage',

  /**
   * Welche Entitäten sollen ein Neuzeichnen auslösen?
   *
   * @param {object} cfg
   * @returns {string[]}
   */
  getWatchedEntities(cfg) {
    return [cfg.entity].filter(Boolean);
  },

  /**
   * Wie wichtig ist die Rubrik gerade? Höchster Wert im Blatt = Aufmacher.
   * Orientierung: 90+ dringend, 50–80 wichtig, 20–40 normal, <10 Nebensache.
   *
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {number}
   */
  getPriority(hass, cfg, ctx) {
    // ✏️ ANPASSEN: Prioritäten
    return analyse(hass, cfg, ctx).status === 'done' ? 70 : 10;
  },

  /**
   * Der Artikel. `lead` ist true, wenn er als Aufmacher gesetzt wird –
   * dann darf er gern etwas ausführlicher sein. `null` = kein Artikel.
   *
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @param {{lead: boolean}} options
   * @returns {{headline: string, html: string}|null}
   */
  renderArticle(hass, cfg, ctx, { lead } = {}) {
    const T = cfg.texts ?? {};
    const a = analyse(hass, cfg, ctx);
    const vars = { rest: 'noch eine Weile' };
    const body = ctx.say(T, a.status, vars);
    return {
      headline: ctx.say(T, `headlines.${a.status === 'noData' ? 'fallback' : a.status}`, vars),
      html: `<p>${body}</p>`,
    };
  },

  /**
   * Kurzinfo für die Randspalte „Kurz notiert“. `null` = keine Faktenbox.
   *
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {{title: string, html: string}|null}
   */
  renderFactbox(hass, cfg, ctx) {
    const a = analyse(hass, cfg, ctx);
    return {
      title: cfg.kicker ?? 'Vorlage',
      html: `<dl class="np-facts"><dt>Status</dt><dd>${ctx.esc(a.value ?? '–')}</dd></dl>`,
    };
  },
};
