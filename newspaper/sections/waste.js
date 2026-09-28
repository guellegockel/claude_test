/**
 * ============================================================================
 *  sections/waste.js – Rubrik „Müllabfuhr“ (Waste Collection Schedule)
 * ============================================================================
 *
 *  Zweck:
 *    Meldet die nächsten Abholungen in ganzen Sätzen („Morgen wird die
 *    Biotonne abgeholt – heute Abend rausstellen.“) und zeigt eine
 *    Terminliste mit Farbpunkt je Tonne.
 *
 *  Datenquelle:
 *    Je Tonnenart ein Sensor der Integration „Waste Collection Schedule“
 *    (mampfes) mit `add_days_to: true`. Gerechnet wird AUSSCHLIESSLICH mit
 *    dem numerischen Attribut `daysTo` – nie mit dem formatierten State,
 *    denn der hängt vom value_template ab. Fehlt `daysTo`, erscheint ein
 *    Hinweis (YAML zum Nachrüsten: README).
 *
 *  Prioritäten (✏️ ANPASSEN in PRIORITY / config.js):
 *    - daysTo = 1 ab `eveningFromHour` → Aufmacher
 *    - daysTo = 0 bis `morningUntilHour` → hoch
 *
 *  Abhängigkeiten:
 *    Keine Importe – alles kommt über `ctx`. Einstellungen/Texte:
 *    Eintrag `id: 'waste'` in config.js.
 *
 *  Typische Anpassungen:
 *    - Tonnen, Farben, Artikel, Texte, Uhrzeiten: config.js
 *    - Wann die Rubrik Aufmacher wird: PRIORITY
 * ============================================================================
 */

// ✏️ ANPASSEN: Prioritäten
const PRIORITY = {
  tomorrowEvening: 95, // morgen Abholung, und es ist Nachmittag/Abend → Aufmacher
  todayMorning: 80,    // heute Abholung, noch vormittags
  tomorrowEarly: 50,   // morgen Abholung, aber noch früh am Tag
  later: 20,
  none: 5,
  notConfigured: 1,
};

/**
 * Liest alle Tonnen aus.
 *
 * @param {object} hass
 * @param {object} cfg
 * @param {object} ctx
 * @returns {Array<object>} Tonnen mit daysTo (Zahl oder null) und Status
 */
function readBins(hass, cfg, ctx) {
  const { ent } = ctx;
  return (cfg.bins ?? []).map((bin) => {
    const so = ent.valid(hass, bin.entity);
    const attrs = so?.attributes ?? {};
    const days = Number(attrs.daysTo);
    return {
      ...bin,
      available: Boolean(so),
      // Nur echte, nicht-negative Zahlen zählen.
      daysTo: so && attrs.daysTo !== null && attrs.daysTo !== '' && Number.isFinite(days) && days >= 0 ? days : null,
      missingAttr: Boolean(so) && !('daysTo' in attrs),
      placeholder: !ent.isConfigured(hass, bin.entity),
    };
  });
}

/**
 * Fasst Tonnen mit gleichem Abholtag zusammen, aufsteigend sortiert.
 *
 * @param {Array<object>} bins
 * @returns {Array<{days: number, bins: Array<object>}>}
 * @example groups → [{ days: 1, bins: [bio, papier] }, { days: 8, bins: [rest] }]
 */
function groupByDay(bins) {
  const map = new Map();
  for (const b of bins) {
    if (b.daysTo === null) continue;
    if (!map.has(b.daysTo)) map.set(b.daysTo, []);
    map.get(b.daysTo).push(b);
  }
  return [...map.entries()].sort((x, y) => x[0] - y[0]).map(([days, list]) => ({ days, bins: list }));
}

/**
 * Platzhalter-Werte für eine Gruppe (Tonnen, Tag, Verben in Einzahl/Mehrzahl).
 *
 * @param {{days: number, bins: Array<object>}} group
 * @param {object} ctx
 * @returns {object}
 */
function groupVars(group, ctx) {
  const { text, fmt } = ctx;
  const bins = group.bins;
  return {
    tonne: text.list(bins.map((b) => text.noun(b, 'nom'))),
    wann: fmt.relDay(group.days, ctx.now),
    wird: text.agree(bins, 'wird', 'werden'),
    kommt: text.agree(bins, 'kommt', 'kommen'),
    war: text.agree(bins, 'war', 'waren'),
    folgt: text.agree(bins, 'folgt', 'folgen'),
  };
}

/**
 * Wertet alles aus und bestimmt die Situation.
 *
 * @param {object} hass
 * @param {object} cfg
 * @param {object} ctx
 * @returns {object}
 */
function analyse(hass, cfg, ctx) {
  const bins = readBins(hass, cfg, ctx);
  const groups = groupByDay(bins);
  const hour = ctx.now.getHours();
  const first = groups[0] ?? null;
  const configured = bins.some((b) => !b.placeholder);
  // Verbleibende Tage dieser Woche (Montag → 6, Sonntag → 0).
  const daysLeftInWeek = 7 - ctx.fmt.isoWeekday(ctx.now);

  let situation = 'none';
  if (!configured) situation = 'notConfigured';
  else if (!bins.some((b) => b.available)) situation = 'noData';
  else if (first?.days === 0) situation = hour < (cfg.morningUntilHour ?? 12) ? 'today' : 'todayLate';
  else if (first?.days === 1) situation = 'tomorrow';
  else if (first) situation = first.days > daysLeftInWeek ? 'noneThisWeek' : 'next';

  return {
    bins, groups, first, situation, hour,
    missingAttr: bins.filter((b) => b.missingAttr),
  };
}

export default {
  id: 'waste',
  kicker: 'Müllabfuhr',

  /**
   * @param {object} cfg
   * @returns {string[]}
   */
  getWatchedEntities(cfg) {
    return (cfg.bins ?? []).map((b) => b.entity).filter(Boolean);
  },

  /**
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {number}
   */
  getPriority(hass, cfg, ctx) {
    const a = analyse(hass, cfg, ctx);
    switch (a.situation) {
      case 'notConfigured': return PRIORITY.notConfigured;
      case 'today': return PRIORITY.todayMorning;
      case 'tomorrow':
        return a.hour >= (cfg.eveningFromHour ?? 14) ? PRIORITY.tomorrowEvening : PRIORITY.tomorrowEarly;
      case 'todayLate':
      case 'next':
      case 'noneThisWeek': return PRIORITY.later;
      default: return PRIORITY.none;
    }
  },

  /**
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {{headline: string, html: string}}
   */
  renderArticle(hass, cfg, ctx) {
    const { say, text } = ctx;
    const T = cfg.texts ?? {};
    const a = analyse(hass, cfg, ctx);

    if (a.situation === 'notConfigured') {
      return { headline: say(T, 'headlines.fallback'), html: ctx.notConfiguredHtml() };
    }

    const sentences = [];
    let headline;

    if (a.situation === 'noData') {
      sentences.push(say(T, 'noData'));
      headline = say(T, 'headlines.fallback');
    } else if (!a.first) {
      sentences.push(say(T, 'none'));
      headline = say(T, 'headlines.none');
    } else {
      const v0 = groupVars(a.first, ctx);
      const second = a.groups[1] ?? null;
      const v1 = second ? groupVars(second, ctx) : null;

      switch (a.situation) {
        case 'today':
          sentences.push(say(T, 'today', v0));
          headline = say(T, 'headlines.today', v0);
          if (v1) sentences.push(say(T, 'after', v1));
          break;
        case 'todayLate':
          sentences.push(say(T, 'todayLate', v0));
          // Nach der Abholung zählt schon der nächste Termin.
          if (v1) {
            sentences.push(say(T, second.days === 1 ? 'tomorrow' : 'next', v1));
            headline = say(T, second.days === 1 ? 'headlines.tomorrow' : 'headlines.next', v1);
          } else {
            headline = say(T, 'headlines.today', v0);
          }
          break;
        case 'tomorrow':
          sentences.push(say(T, 'tomorrow', v0));
          headline = say(T, 'headlines.tomorrow', v0);
          if (v1) sentences.push(say(T, 'after', v1));
          break;
        case 'noneThisWeek':
          sentences.push(say(T, 'noneThisWeek', v0));
          headline = say(T, 'headlines.next', v0);
          break;
        default: // next
          sentences.push(say(T, 'next', v0));
          headline = say(T, 'headlines.next', v0);
          if (v1) sentences.push(say(T, 'after', v1));
      }
    }

    if (a.missingAttr.length) {
      sentences.push(`<span class="np-hint">${say(T, 'missingDaysTo', {
        tonne: text.list(a.missingAttr.map((b) => text.noun(b, 'akk'))),
      })}</span>`);
    }

    return { headline, html: `<p>${sentences.filter(Boolean).join(' ')}</p>` };
  },

  /**
   * Terminliste mit Farbpunkt.
   *
   * @param {object} hass
   * @param {object} cfg
   * @param {object} ctx
   * @returns {{title: string, html: string}|null}
   */
  renderFactbox(hass, cfg, ctx) {
    const { esc, fmt } = ctx;
    const T = cfg.texts ?? {};
    const a = analyse(hass, cfg, ctx);
    if (a.situation === 'notConfigured') return null;

    const limit = cfg.listDays ?? 21;
    const upcoming = a.bins
      .filter((b) => b.daysTo !== null && b.daysTo <= limit)
      .sort((x, y) => x.daysTo - y.daysTo);
    const broken = a.bins.filter((b) => b.daysTo === null && (!b.available || b.missingAttr));

    // Farbe kommt aus config.js – trotzdem maskieren, sie landet in einem Attribut.
    const item = (b, when, cls = '') => `<li class="${cls}">
        <span class="dot" style="--dot:${esc(b.color ?? '')}"></span>
        <span>${esc(b.label ?? b.name)}</span>
        <span class="when">${esc(when)}</span>
      </li>`;

    const items = [
      ...upcoming.map((b) => item(b, fmt.relDayShort(b.daysTo, ctx.now), b.daysTo <= 1 ? 'soon' : '')),
      ...broken.map((b) => item(b, T.factboxNoData ?? 'keine Daten', 'muted')),
    ];

    return {
      title: T.factboxTitle ?? 'Abfuhrtermine',
      html: items.length
        ? `<ul class="np-dates">${items.join('')}</ul>`
        : `<p class="muted">${esc(T.factboxEmpty ?? 'Keine Termine')}</p>`,
    };
  },
};
