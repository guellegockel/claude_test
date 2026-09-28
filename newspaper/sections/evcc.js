/**
 * ============================================================================
 *  sections/evcc.js – Rubrik „E-Auto laden“ (evcc über ha-evcc von marq24)
 * ============================================================================
 *
 *  Zweck:
 *    Beschreibt den Ladezustand als Fließtext („Das Auto ist zu 64 % geladen
 *    und bezieht gerade 7,2 kW, davon 80 % aus der eigenen Solaranlage.“)
 *    mit antippbarem Lademodus. Die Faktenbox zeigt die Kennzahlen und eine
 *    klassische Modus-Auswahl.
 *
 *  Lademodi & evcc-Versionen:
 *    Die Modi werden IMMER dynamisch aus `attributes.options` der
 *    Mode-Select-Entität gelesen (alt: off|pv|minpv|now, neu: off|smart|now).
 *    Deutsche Namen kommen aus `modeLabels` in config.js; unbekannte Modi
 *    erscheinen mit Rohnamen. Das Select „alwaysCharge“ (neue evcc) wird nur
 *    gezeigt, wenn die Entität existiert. Geschaltet wird mit
 *    select.select_option (über die Bedienelemente in core/controls.js).
 *
 *  Solaranteil:
 *    Bevorzugt aus `entities.greenShare` (evcc „greenShareLoadpoints“,
 *    0–1 oder %). Fehlt der Sensor, wird genähert: Was an Netzbezug und
 *    Batterie-Entladung ins Haus fließt, gilt als „nicht solar“ – der Rest
 *    der Ladeleistung als Sonnenstrom. Das ist eine Näherung, weil der
 *    übrige Hausverbrauch nicht getrennt betrachtet wird.
 *
 *  Abhängigkeiten:
 *    Keine Importe – alles kommt über `ctx`. Einstellungen/Texte:
 *    Eintrag `id: 'evcc'` in config.js.
 *
 *  Typische Anpassungen:
 *    - Entitäten, Texte, Namen der Modi: config.js
 *    - Wann die Rubrik Aufmacher wird: PRIORITY
 * ============================================================================
 */

// ✏️ ANPASSEN: Priorität je Situation (höchste Priorität im Blatt = Aufmacher)
const PRIORITY = {
  full: 85,          // voll geladen
  limitReached: 80,  // Ladeziel erreicht
  offButConnected: 75, // angesteckt, aber Modus „off“
  charging: 45,
  waiting: 30,
  unknown: 15,
  notConnected: 10,
  noData: 2,
  notConfigured: 1,
};

// Ab dieser Ladeleistung (kW) gilt „lädt“, auch ohne charging-Sensor.
const CHARGING_MIN_KW = 0.05;

/**
 * Solaranteil der aktuellen Ladung in Prozent.
 *
 * @param {object} hass
 * @param {object} cfg
 * @param {object} ctx
 * @param {number|null} chargeKw
 * @param {number|null} gridKw     Netzleistung (positiv = Bezug, nach Umrechnung)
 * @param {number|null} batteryKw  Batterieleistung (positiv = Entladen, nach Umrechnung)
 * @returns {number|null}
 */
function greenSharePercent(hass, cfg, ctx, chargeKw, gridKw, batteryKw) {
  const { ent } = ctx;
  const id = cfg.entities?.greenShare;
  const direct = ent.num(hass, id);
  if (direct !== null) {
    // evcc liefert 0–1; manche Sensoren sind bereits in %.
    const unit = ent.attr(hass, id, 'unit_of_measurement');
    return unit === '%' || direct > 1 ? direct : direct * 100;
  }
  if (!chargeKw || chargeKw <= CHARGING_MIN_KW || gridKw === null) return null;
  const notSolar = Math.max(gridKw, 0) + Math.max(batteryKw ?? 0, 0);
  const share = 1 - notSolar / chargeKw;
  return Math.min(Math.max(share, 0), 1) * 100;
}

/**
 * Wertet alle evcc-Daten aus.
 *
 * @param {object} hass
 * @param {object} cfg
 * @param {object} ctx
 * @returns {object}
 */
function analyse(hass, cfg, ctx) {
  const { ent, fmt } = ctx;
  const e = cfg.entities ?? {};

  const modeObj = ent.valid(hass, e.mode);
  const alwaysObj = e.alwaysCharge ? ent.valid(hass, e.alwaysCharge) : null;
  const connected = ent.isOn(hass, e.connected);
  const chargingFlag = ent.isOn(hass, e.charging);
  const soc = ent.num(hass, e.vehicleSoc);
  const limit = e.limitSoc ? ent.num(hass, e.limitSoc) : null;
  const chargeKw = ent.powerKw(hass, e.chargePower);
  const pvKw = ent.powerKw(hass, e.pvPower);
  const rawGrid = ent.powerKw(hass, e.gridPower);
  const gridKw = rawGrid === null ? null : rawGrid * (cfg.gridImportPositive === false ? -1 : 1);
  const batterySoc = e.batterySoc ? ent.num(hass, e.batterySoc) : null;
  const rawBattery = e.batteryPower ? ent.powerKw(hass, e.batteryPower) : null;
  const batteryKw = rawBattery === null ? null : rawBattery * (cfg.batteryDischargePositive === false ? -1 : 1);

  const charging = chargingFlag === true || (chargeKw !== null && chargeKw > CHARGING_MIN_KW);
  const share = charging ? greenSharePercent(hass, cfg, ctx, chargeKw, gridKw, batteryKw) : null;
  const full = soc !== null && soc >= (cfg.fullSoc ?? 100);
  const limitReached = !full && soc !== null && limit !== null && limit > 0 && soc >= limit;
  const modeOff = modeObj?.state === 'off';

  // Ladeplan nur zeigen, wenn die Zielzeit gültig ist und in der Zukunft liegt.
  const planDate = e.planTime ? fmt.toDate(ent.state(hass, e.planTime)) : null;
  const plan = planDate && planDate > ctx.now ? planDate : null;

  const configured = ent.isConfigured(hass, e.mode) || ent.isConfigured(hass, e.connected);
  const hasData = Boolean(modeObj) || connected !== null || soc !== null || chargeKw !== null;

  // Eine Situation bestimmt Text, Schlagzeile und Priorität.
  let status;
  if (!configured) status = 'notConfigured';
  else if (!hasData) status = 'noData';
  else if (charging) status = 'charging';
  else if (connected === false) status = 'notConnected';
  else if (connected === null) status = 'unknown';
  else if (full) status = 'full';
  else if (limitReached) status = 'limitReached';
  else if (modeOff) status = 'offButConnected';
  else status = 'waiting';

  const vehicleName = e.vehicleName ? ent.state(hass, e.vehicleName) : null;

  return {
    status, modeObj, alwaysObj, connected, soc, limit, chargeKw, pvKw, gridKw,
    batterySoc, batteryKw, charging, share, plan, vehicleName,
  };
}

/**
 * Antippbarer Lademodus für den Fließtext (oder reiner Text ohne Daten).
 *
 * @param {object} a
 * @param {object} cfg
 * @param {object} ctx
 * @returns {{__raw: string}}
 */
function inlineMode(a, cfg, ctx) {
  const { ui, raw, esc } = ctx;
  if (!a.modeObj) return raw(esc('unbekannt'));
  return raw(ui.inlineSelect({
    entity: a.modeObj.entity_id,
    value: a.modeObj.state,
    options: ui.optionsFrom(a.modeObj, cfg.modeLabels),
    title: cfg.texts?.labels?.mode ?? 'Lademodus',
  }));
}

/**
 * Platzhalter-Werte für alle evcc-Texte.
 *
 * @param {object} a
 * @param {object} cfg
 * @param {object} ctx
 * @returns {object}
 */
function textVars(a, cfg, ctx) {
  const { fmt, raw, say, text } = ctx;
  const T = cfg.texts ?? {};
  const vehicle = { name: 'Auto', genus: 'n', ...(cfg.vehicle ?? {}) };
  return {
    wagen: text.noun(vehicle, 'nom'),
    name: vehicle.name,
    soc: fmt.percent(a.soc),
    limit: fmt.percent(a.limit),
    leistung: fmt.power(a.chargeKw),
    anteil: raw(a.share !== null ? say(T, 'share', { share: fmt.percent(a.share) }) : ''),
    modus: inlineMode(a, cfg, ctx),
    zeit: a.plan ? `${fmt.relDay(fmt.daysBetween(ctx.now, a.plan), ctx.now)} ${fmt.time(a.plan)}` : '',
  };
}

export default {
  id: 'evcc',
  kicker: 'E-Auto laden',

  /**
   * @param {object} cfg
   * @returns {string[]}
   */
  getWatchedEntities(cfg) {
    return Object.values(cfg.entities ?? {}).filter(Boolean);
  },

  /**
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {number}
   */
  getPriority(hass, cfg, ctx) {
    return PRIORITY[analyse(hass, cfg, ctx).status] ?? 0;
  },

  /**
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @param {{lead: boolean}} options  lead = als Aufmacher gesetzt
   * @returns {{headline: string, html: string}}
   */
  renderArticle(hass, cfg, ctx, { lead } = {}) {
    const { say, fmt, ui, raw } = ctx;
    const T = cfg.texts ?? {};
    const a = analyse(hass, cfg, ctx);
    const vars = textVars(a, cfg, ctx);

    if (a.status === 'notConfigured') {
      return { headline: say(T, 'headlines.fallback'), html: ctx.notConfiguredHtml() };
    }
    if (a.status === 'noData') {
      return { headline: say(T, 'headlines.fallback'), html: `<p>${say(T, 'noData')}</p>` };
    }

    // --- Absatz 1: das Fahrzeug ---------------------------------------------
    const car = [];
    switch (a.status) {
      case 'charging':
        car.push(say(T, a.soc !== null ? 'charging' : 'chargingNoSoc', vars));
        car.push(say(T, 'modeCharging', vars));
        break;
      case 'full':
        car.push(say(T, 'full', vars));
        car.push(say(T, 'modeIdle', vars));
        break;
      case 'limitReached':
        car.push(say(T, 'limitReached', vars));
        car.push(say(T, 'modeIdle', vars));
        break;
      case 'offButConnected':
        // Der Modus steckt bereits antippbar im Satz.
        car.push(say(T, 'offButConnected', vars));
        break;
      case 'waiting':
        car.push(say(T, a.soc !== null ? 'waiting' : 'waitingNoSoc', vars));
        car.push(say(T, 'modeIdle', vars));
        break;
      case 'unknown':
        car.push(say(T, 'unknown', vars));
        car.push(say(T, 'modeIdle', vars));
        break;
      default: // notConnected – Modus trotzdem antippbar, um ihn vorab zu wählen
        car.push(say(T, 'notConnected', vars));
        car.push(say(T, 'modeIdle', vars));
    }
    if (a.alwaysObj) {
      car.push(say(T, 'alwaysCharge', {
        wert: raw(ui.inlineSelect({
          entity: a.alwaysObj.entity_id,
          value: a.alwaysObj.state,
          options: ui.optionsFrom(a.alwaysObj, cfg.alwaysChargeLabels),
          title: T.labels?.alwaysCharge ?? 'Immer laden',
        })),
      }));
    }
    if (a.plan && a.connected !== false) car.push(say(T, 'plan', vars));

    // --- Absatz 2: Energie im Haus (nur im Aufmacher, sonst Faktenbox) ------
    const energy = [];
    if (lead && a.pvKw !== null && a.pvKw > CHARGING_MIN_KW) {
      let netz = '';
      if (a.gridKw !== null && a.gridKw < -CHARGING_MIN_KW) netz = say(T, 'gridExport', { netz: fmt.power(-a.gridKw) });
      else if (a.gridKw !== null && a.gridKw > CHARGING_MIN_KW) netz = say(T, 'gridImport', { netz: fmt.power(a.gridKw) });
      energy.push(say(T, 'pv', { pv: fmt.power(a.pvKw), netz: raw(netz) }));
    }
    if (lead && a.batterySoc !== null) energy.push(say(T, 'battery', { akku: fmt.percent(a.batterySoc) }));

    const html = [car, energy]
      .filter((p) => p.length)
      .map((p) => `<p>${p.filter(Boolean).join(' ')}</p>`)
      .join('');

    let headlineKey = a.status;
    if (a.status === 'charging' && a.share !== null && a.share >= 80) headlineKey = 'chargingSolar';
    if (a.status === 'unknown') headlineKey = 'fallback';
    return { headline: say(T, `headlines.${headlineKey}`, vars), html };
  },

  /**
   * Kennzahlen und klassische Modus-Auswahl.
   *
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {{title: string, html: string}|null}
   */
  renderFactbox(hass, cfg, ctx) {
    const { fmt, esc, ui } = ctx;
    const T = cfg.texts ?? {};
    const L = T.labels ?? {};
    const a = analyse(hass, cfg, ctx);
    if (a.status === 'notConfigured') return null;

    const rows = [];
    const row = (label, value, cls = '') => rows.push(`<dt>${esc(label)}</dt><dd class="${cls}">${esc(value)}</dd>`);

    const connectedText = a.connected === null ? '–' : a.connected ? (L.connected ?? 'angeschlossen') : (L.notConnected ?? 'nicht da');
    row(L.vehicle ?? 'Fahrzeug', a.vehicleName ? `${a.vehicleName} · ${connectedText}` : connectedText);
    row(L.soc ?? 'Ladestand', a.limit !== null ? `${fmt.percent(a.soc)} → ${fmt.percent(a.limit)}` : fmt.percent(a.soc));
    if (a.charging) row(L.power ?? 'Ladeleistung', fmt.power(a.chargeKw));
    if (a.share !== null) row(L.share ?? 'Solaranteil', fmt.percent(a.share), a.share >= 50 ? 'ok' : '');
    if (a.pvKw !== null) row(L.pv ?? 'PV-Erzeugung', fmt.power(a.pvKw));
    if (a.gridKw !== null) {
      const exporting = a.gridKw < 0;
      row(L.grid ?? 'Netz', `${exporting ? (L.gridExport ?? 'Einspeisung') : (L.gridImport ?? 'Bezug')} ${fmt.power(Math.abs(a.gridKw))}`);
    }
    if (a.batterySoc !== null) row(L.battery ?? 'Hausbatterie', fmt.percent(a.batterySoc));
    if (a.plan) row(L.plan ?? 'Ladeplan', `${fmt.relDayShort(fmt.daysBetween(ctx.now, a.plan), ctx.now)} ${fmt.time(a.plan)}`);

    // Klassische Modus-Knöpfe nur, wenn in config.js gewünscht (factboxControls).
    let controls = '';
    if (cfg.factboxControls && a.modeObj) {
      controls += `<p class="np-control-label">${esc(L.mode ?? 'Lademodus')}</p>
        ${ui.choice({ entity: a.modeObj.entity_id, value: a.modeObj.state, options: ui.optionsFrom(a.modeObj, cfg.modeLabels) })}`;
    }
    if (cfg.factboxControls && a.alwaysObj) {
      controls += `<p class="np-control-label">${esc(L.alwaysCharge ?? 'Immer laden')}</p>
        ${ui.choice({ entity: a.alwaysObj.entity_id, value: a.alwaysObj.state, options: ui.optionsFrom(a.alwaysObj, cfg.alwaysChargeLabels) })}`;
    }

    return {
      title: T.factboxTitle ?? 'Wallbox',
      html: `<dl class="np-facts">${rows.join('')}</dl>${controls ? `<div class="np-control">${controls}</div>` : ''}`,
    };
  },
};
