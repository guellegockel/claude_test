/**
 * ============================================================================
 *  sections/switchboard.js – Rubrik „Schaltkasten“
 * ============================================================================
 *
 *  Zweck:
 *    Klassische Bedienelemente in der Randspalte für die in config.js
 *    gelisteten Entitäten:
 *      - light, switch, input_boolean, fan, … → Kippschalter (<np-toggle>)
 *      - select, input_select                  → Segment-Auswahl (<np-choice>)
 *    Diese Rubrik liefert nur eine Faktenbox, keinen Artikel – sie kann also
 *    nie Aufmacher werden.
 *
 *  Abhängigkeiten:
 *    Keine Importe – alles kommt über `ctx`. Einstellungen: Eintrag
 *    `id: 'switchboard'` in config.js (Liste `items`).
 *
 *  Typische Anpassungen:
 *    - Schalter hinzufügen/entfernen: config.js → items
 *    - Weitere Domänen als Auswahl behandeln: SELECT_DOMAINS
 * ============================================================================
 */

// Domänen, die als Auswahl statt als Kippschalter erscheinen.
const SELECT_DOMAINS = new Set(['select', 'input_select']);

export default {
  id: 'switchboard',
  kicker: 'Schaltkasten',

  /**
   * @param {object} cfg
   * @returns {string[]}
   */
  getWatchedEntities(cfg) {
    return (cfg.items ?? []).map((i) => i.entity).filter(Boolean);
  },

  /** @returns {number} Nie Aufmacher. */
  getPriority() {
    return 0;
  },

  /**
   * Alle Schalter als Faktenbox.
   *
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {{title: string, html: string}|null}
   * @example Eintrag in config.js: { entity: 'light.flur', label: 'Licht Flur' }
   */
  renderFactbox(hass, cfg, ctx) {
    const { ent, ui, esc } = ctx;
    const T = cfg.texts ?? {};
    const items = cfg.items ?? [];
    if (!items.length) return null;

    const html = items.map((item) => {
      const label = item.label ?? ent.friendlyName(hass, item.entity);
      const so = ent.valid(hass, item.entity);

      if (SELECT_DOMAINS.has(ent.domain(item.entity))) {
        if (!so) {
          const note = ent.isConfigured(hass, item.entity) ? T.unavailable : T.placeholder;
          return `<p class="np-control-label">${esc(label)} · <span class="muted">${esc(note ?? '–')}</span></p>`;
        }
        return `<p class="np-control-label">${esc(label)}</p>
          ${ui.choice({ entity: item.entity, value: so.state, options: ui.optionsFrom(so, item.labels) })}`;
      }

      // Kippschalter; ohne gültigen Zustand ausgegraut mit Hinweis.
      if (!so) {
        const note = ent.isConfigured(hass, item.entity) ? T.unavailable : T.placeholder;
        return ui.toggle({ entity: item.entity, on: false, label, note: note ?? '–', disabled: true });
      }
      return ui.toggle({ entity: item.entity, on: ent.isOn(hass, item.entity) === true, label });
    }).join('');

    // placement 'rail': eigene Randspalte rechts statt Leiste „Kurz notiert“.
    return { title: cfg.kicker ?? 'Schaltkasten', html, placement: 'rail' };
  },
};
