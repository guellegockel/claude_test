/**
 * ============================================================================
 *  sections/weather.js – Rubrik „Wetter & Raumklima“
 * ============================================================================
 *
 *  Zweck:
 *    Außen: aktuelles Wetter und Vorhersage als Fließtext („Heute bleibt es
 *    trocken, am Nachmittag bis 18 °C.“). Ab `tomorrowFromHour` blickt der
 *    Text auf morgen.
 *    Innen: Temperatur/Luftfeuchte je Raum, wärmster/kältester Raum und
 *    Lüftungshinweis ab `thresholds.ventilateHumidity`.
 *    Faktenbox: Tabelle Raum | Temp | Feuchte.
 *
 *  Datenquellen:
 *    - weather.* für den aktuellen Zustand (state + attributes.temperature)
 *    - Vorhersage per `weather/subscribe_forecast` (NICHT aus Attributen);
 *      angefordert über getForecasts(), gelesen mit ctx.forecast().
 *    - je Raum ein Temperatur- und optional ein Feuchtesensor
 *
 *  Abhängigkeiten:
 *    Keine Importe – alles kommt über `ctx` (siehe newspaper-panel.js).
 *    Einstellungen und Texte: Eintrag `id: 'weather'` in config.js.
 *
 *  Typische Anpassungen:
 *    - Texte/Schwellwerte: config.js
 *    - Welche Wetterlage als Regen/Schnee/Gewitter zählt: Mengen unten
 *    - Prioritäten (wann Wetter Aufmacher wird): getPriority()
 * ============================================================================
 */

// Wetterzustände (HA-Standard), die als Regen/Schnee/Gewitter zählen.
// ✏️ ANPASSEN: Zuordnung der Zustände
const RAIN = new Set(['rainy', 'pouring', 'lightning-rainy', 'hail']);
const SNOW = new Set(['snowy', 'snowy-rainy']);
const THUNDER = new Set(['lightning', 'lightning-rainy']);

// Standardwerte, falls in config.js ein Schwellwert fehlt.
const DEFAULT_THRESHOLDS = {
  ventilateHumidity: 65,
  rainProbability: 50,
  rainAmount: 1,
  frost: 0,
  heat: 30,
  windStrong: 50,
  roomSpread: 1.5,
};

/**
 * Bildet „aus dem Keller“ aus „im Keller“ (für den Ersatztext bei fehlenden
 * Messwerten). Kann pro Raum mit `from` überschrieben werden.
 *
 * @param {{name: string, where?: string, from?: string}} room
 * @returns {string}
 * @example fromPhrase({ where: 'in der Küche' }) // → "aus der Küche"
 */
function fromPhrase(room) {
  if (room.from) return room.from;
  const where = room.where ?? `im ${room.name}`;
  return where
    .replace(/^im\s/, 'aus dem ')
    .replace(/^in der\s/, 'aus der ')
    .replace(/^in den\s/, 'aus den ')
    .replace(/^in\s/, 'aus ');
}

/**
 * Windgeschwindigkeit der Vorhersage in km/h (Einheit steht am Wetterobjekt).
 *
 * @param {number|null} value
 * @param {string} [unit='km/h']
 * @returns {number|null}
 */
function toKmh(value, unit = 'km/h') {
  if (value === null) return null;
  if (unit === 'm/s') return value * 3.6;
  if (unit === 'mph') return value * 1.609;
  if (unit === 'kn') return value * 1.852;
  return value;
}

/**
 * Wählt den Vorhersagetag: bis `tomorrowFromHour` heute, danach morgen.
 * Gesucht wird über das Datum; nur wenn nichts passt, nach Position.
 *
 * @param {Array<object>|null} daily  Tagesvorhersage
 * @param {Date} now
 * @param {number} fromHour
 * @param {object} fmt  ctx.fmt
 * @returns {{entry: object, tomorrow: boolean}|null}
 */
function selectDay(daily, now, fromHour, fmt) {
  if (!Array.isArray(daily) || daily.length === 0) return null;
  const tomorrow = now.getHours() >= fromHour;
  const offset = tomorrow ? 1 : 0;
  const entry = daily.find((f) => {
    const d = fmt.toDate(f.datetime);
    return d && fmt.daysBetween(now, d) === offset;
  }) ?? daily[offset];
  return entry ? { entry, tomorrow } : null;
}

/**
 * Wertet alle Daten der Rubrik einmal aus. Wird von Priorität, Artikel und
 * Faktenbox gleichermaßen genutzt, damit alle dieselbe Sicht haben.
 *
 * @param {object} hass
 * @param {object} cfg  Rubrik-Eintrag aus config.js
 * @param {object} ctx
 * @returns {object} Auswertung
 */
function analyse(hass, cfg, ctx) {
  const { ent, fmt } = ctx;
  const th = { ...DEFAULT_THRESHOLDS, ...(cfg.thresholds ?? {}) };

  // --- Außen ---------------------------------------------------------------
  const weather = ent.valid(hass, cfg.entity);
  const condition = weather ? ctx.config.weatherConditions?.[weather.state] ?? null : null;
  const temp = weather ? fmt.toNumber(weather.attributes?.temperature) : null;
  const outdoorHumidity = weather ? fmt.toNumber(weather.attributes?.humidity) : null;

  const day = weather ? selectDay(ctx.forecast(cfg.entity, 'daily'), ctx.now, cfg.tomorrowFromHour ?? 17, fmt) : null;
  const f = day?.entry ?? null;
  const max = fmt.toNumber(f?.temperature);
  const min = fmt.toNumber(f?.templow);
  const probability = fmt.toNumber(f?.precipitation_probability);
  const amount = fmt.toNumber(f?.precipitation);
  const wind = toKmh(fmt.toNumber(f?.wind_speed), weather?.attributes?.wind_speed_unit);

  const flags = { thunder: false, snow: false, rain: false, frost: false, heat: false, wind: false };
  if (f) {
    flags.thunder = THUNDER.has(f.condition);
    flags.snow = !flags.thunder && SNOW.has(f.condition);
    flags.rain = !flags.thunder && !flags.snow && (
      RAIN.has(f.condition)
      || (probability !== null && probability >= th.rainProbability)
      || (amount !== null && amount >= th.rainAmount));
    flags.frost = min !== null && min <= th.frost;
    flags.heat = max !== null && max >= th.heat;
    flags.wind = wind !== null && wind >= th.windStrong;
  }

  // --- Innen ---------------------------------------------------------------
  const rooms = (cfg.rooms ?? []).map((r) => ({
    ...r,
    where: r.where ?? `im ${r.name}`,
    t: ent.num(hass, r.temperature),
    h: r.humidity ? ent.num(hass, r.humidity) : null,
  }));
  const measured = rooms.filter((r) => r.t !== null);
  const missing = rooms.filter((r) => r.t === null && r.h === null);
  const ventilate = rooms.filter((r) => r.h !== null && r.h >= th.ventilateHumidity);

  let warm = null;
  let cold = null;
  if (measured.length >= 2) {
    const sorted = [...measured].sort((a, b) => b.t - a.t);
    // Nur erwähnen, wenn der Unterschied auch nennenswert ist.
    if (sorted[0].t - sorted[sorted.length - 1].t >= th.roomSpread) {
      warm = sorted[0];
      cold = sorted[sorted.length - 1];
    }
  }

  // Eingerichtet = mindestens eine Entität ist kein (fehlender) Platzhalter mehr.
  const configured = ent.isConfigured(hass, cfg.entity)
    || rooms.some((r) => ent.isConfigured(hass, r.temperature));

  return {
    th, weather, condition, temp, outdoorHumidity,
    day: f, tomorrow: day?.tomorrow ?? false, max, min, probability, wind, flags,
    rooms, measured, missing, ventilate, warm, cold, configured,
  };
}

/**
 * Schlüssel der passenden Schlagzeile (Reihenfolge = Wichtigkeit).
 *
 * @param {object} a  Auswertung
 * @returns {string}
 */
function headlineKey(a) {
  if (a.flags.thunder) return 'thunder';
  if (a.flags.frost) return 'frost';
  if (a.flags.heat) return 'heat';
  if (a.ventilate.length) return 'ventilate';
  if (a.flags.rain) return 'rain';
  if (a.flags.snow) return 'snow';
  if (a.condition && a.temp !== null) return 'current';
  return 'fallback';
}

/**
 * Gemeinsame Platzhalter-Werte für Außen-Texte und Schlagzeilen.
 *
 * @param {object} a
 * @param {object} ctx
 * @param {object} texts
 * @returns {object}
 */
function outdoorVars(a, ctx, texts) {
  const { fmt, raw, say } = ctx;
  return {
    zustand: a.condition?.label ?? '',
    temp: fmt.temp(a.temp),
    tag: a.tomorrow ? 'morgen' : 'heute',
    max: fmt.temp(a.max),
    min: fmt.temp(a.min),
    wind: fmt.speed(a.wind),
    // Verschachtelter Baustein: Ergebnis ist HTML → raw()
    chance: raw(a.probability ? say(texts, 'chance', { p: fmt.percent(a.probability) }) : ''),
    wo: ctx.text.list(a.ventilate.map((r) => r.where)),
  };
}

export default {
  id: 'weather',
  kicker: 'Wetter & Raumklima',

  /**
   * @param {object} cfg
   * @returns {string[]}
   */
  getWatchedEntities(cfg) {
    return [cfg.entity, ...(cfg.rooms ?? []).flatMap((r) => [r.temperature, r.humidity])].filter(Boolean);
  },

  /**
   * @param {object} cfg
   * @returns {Array<{entity_id: string, type: string}>}
   */
  getForecasts(cfg) {
    return cfg.entity ? [{ entity_id: cfg.entity, type: 'daily' }] : [];
  },

  /**
   * Wetter wird Aufmacher bei Unwetter, Frost, Hitze, Lüftungsbedarf.
   *
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {number} 0–100
   */
  getPriority(hass, cfg, ctx) {
    const a = analyse(hass, cfg, ctx);
    // ✏️ ANPASSEN: Prioritäten der Wetter-Rubrik
    if (!a.configured) return 1;
    if (a.flags.thunder || a.flags.frost || a.flags.heat) return 60;
    if (a.ventilate.length) return 50;
    if (a.flags.rain || a.flags.snow) return 45;
    if (a.weather) return 25;
    return 5;
  },

  /**
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @param {{lead: boolean}} options  lead = als Aufmacher gesetzt
   * @returns {{headline: string, html: string}}
   */
  renderArticle(hass, cfg, ctx, { lead } = {}) {
    const { fmt, raw, say, text } = ctx;
    const T = cfg.texts ?? {};
    const a = analyse(hass, cfg, ctx);

    if (!a.configured) {
      return { headline: say(T, 'headlines.fallback'), html: ctx.notConfiguredHtml() };
    }

    const vars = outdoorVars(a, ctx, T);

    // --- Absatz 1: draußen ---------------------------------------------------
    const outdoor = [];
    if (a.weather) {
      if (a.condition && a.temp !== null) outdoor.push(say(T, 'current', vars));
      else if (a.condition) outdoor.push(say(T, 'currentNoTemp', vars));
      else if (a.temp !== null) outdoor.push(say(T, 'currentNoCondition', vars));

      if (a.day) {
        const key = a.flags.thunder ? 'thunder' : a.flags.snow ? 'snow' : a.flags.rain ? 'rain' : 'dry';
        outdoor.push(say(T, key, vars));
        if (a.flags.heat) outdoor.push(say(T, 'heat', vars));
        if (a.flags.frost) outdoor.push(say(T, 'frost', vars));
        else if (a.min !== null) outdoor.push(say(T, 'night', vars));
        if (a.flags.wind) outdoor.push(say(T, 'wind', vars));
      } else {
        outdoor.push(say(T, 'noForecast'));
      }
    } else {
      outdoor.push(say(T, 'noWeather'));
    }

    // --- Absatz 2: drinnen ---------------------------------------------------
    const indoor = [];
    if (a.rooms.length) {
      if (a.measured.length) {
        const items = a.measured.map((r) => (r.h !== null
          ? say(T, 'roomItem', { wo: r.where, temp: fmt.temp(r.t, 1), h: fmt.percent(r.h) })
          : say(T, 'roomItemNoHumidity', { wo: r.where, temp: fmt.temp(r.t, 1) })));
        // Die Raumliste nur im Aufmacher – sonst steht sie ja in der Faktenbox.
        if (lead) indoor.push(say(T, 'rooms', { liste: raw(text.list(items)) }));
        if (a.warm && a.cold) {
          indoor.push(say(T, 'extremes', {
            warmWo: a.warm.where, warmTemp: fmt.temp(a.warm.t, 1),
            kaltWo: a.cold.where, kaltTemp: fmt.temp(a.cold.t, 1),
          }));
        }
        if (a.ventilate.length) {
          indoor.push(say(T, 'ventilate', {
            wo: text.list(a.ventilate.map((r) => r.where)),
            h: text.list(a.ventilate.map((r) => fmt.percent(r.h)), 'bzw.'),
          }));
        }
        if (a.missing.length) {
          indoor.push(say(T, 'roomMissing', { von: text.list(a.missing.map(fromPhrase)) }));
        }
      } else {
        indoor.push(say(T, 'noRooms'));
      }
    }

    const html = [outdoor, indoor]
      .filter((p) => p.length)
      .map((p) => `<p>${p.filter(Boolean).join(' ')}</p>`)
      .join('');

    return { headline: say(T, `headlines.${headlineKey(a)}`, vars), html };
  },

  /**
   * Tabelle Raum | Temp | Feuchte (erste Zeile: außen).
   *
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {{title: string, html: string}|null}
   */
  renderFactbox(hass, cfg, ctx) {
    const { fmt, esc } = ctx;
    const T = cfg.texts ?? {};
    const a = analyse(hass, cfg, ctx);
    if (!a.rooms.length && !a.weather) return null;

    const row = (label, t, h, cls = '', warnHumidity = false) => `
      <tr class="${cls}">
        <th scope="row">${esc(label)}</th>
        <td>${esc(t)}</td>
        <td class="${warnHumidity ? 'warn' : ''}">${esc(h)}</td>
      </tr>`;

    const rows = [];
    if (a.weather) {
      rows.push(row(T.outdoor ?? 'Außen', fmt.temp(a.temp), fmt.percent(a.outdoorHumidity), 'outdoor'));
    }
    for (const r of a.rooms) {
      const warn = r.h !== null && r.h >= a.th.ventilateHumidity;
      rows.push(row(r.name, fmt.temp(r.t, 1), fmt.percent(r.h), r.t === null ? 'muted' : '', warn));
    }

    return {
      title: T.factboxTitle ?? 'Raumklima',
      html: `<table class="np-table">
          <thead><tr>
            <th scope="col">${esc(T.tableRoom ?? 'Raum')}</th>
            <th scope="col">${esc(T.tableTemp ?? 'Temp.')}</th>
            <th scope="col">${esc(T.tableHumidity ?? 'Feuchte')}</th>
          </tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>`,
    };
  },
};
