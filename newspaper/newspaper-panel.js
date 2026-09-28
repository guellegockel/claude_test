/**
 * ============================================================================
 *  newspaper-panel.js – Hauptkomponente <newspaper-panel>
 * ============================================================================
 *
 *  Zweck:
 *    Das Home-Assistant-Panel „Die Hauszeitung“. Diese Datei
 *      - lädt config.js, die Kernmodule (core/) und alle Rubriken (sections/),
 *      - bestimmt den Aufmacher (Rubrik mit der höchsten Priorität),
 *      - setzt Zeitungskopf, Artikelspalten, die Leiste „Kurz notiert“ und
 *        die Randspalte (Schaltkasten) zusammen,
 *      - zeichnet NUR neu, wenn sich eine tatsächlich verwendete Entität
 *        ändert (plus einmal pro Minute für Uhrzeit/„morgen“-Logik),
 *      - führt Schaltbefehle der Bedienelemente aus (hass.callService) und
 *        gibt Rückmeldung,
 *      - schaltet Tag/Nacht über sun.sun um,
 *      - verwaltet die Wettervorhersage-Abos und beendet sie beim Entfernen.
 *
 *  Von Home Assistant gesetzte Properties: hass, narrow, panel (und route).
 *
 *  Rubrik-Schnittstelle (Plugin, `export default { … }` in sections/*.js):
 *    id, kicker                               Kennung und Standard-Dachzeile
 *    getWatchedEntities(cfg) → string[]       Entitäten, deren Änderung neu zeichnet
 *    getForecasts?(cfg) → [{entity_id,type}]  optional: benötigte Wettervorhersagen
 *    getPriority(hass, cfg, ctx) → Zahl       0–100, höchste wird Aufmacher
 *    renderArticle(hass, cfg, ctx, {lead}) → {headline, html} | null
 *    renderFactbox(hass, cfg, ctx) → {title, html, placement?} | null
 *                                             placement 'rail' = rechte Randspalte,
 *                                             sonst Leiste „Kurz notiert“
 *  `cfg` ist der Eintrag der Rubrik aus config.js, `ctx` siehe _context().
 *
 *  Abhängigkeiten (alle dynamisch geladen, siehe „Cache-Busting“ unten):
 *    config.js, core/format.js, core/text-engine.js, core/entities.js,
 *    core/forecast.js, core/controls.js, core/theme.js, sections/*.js
 *
 *  Cache-Busting:
 *    configuration.yaml lädt diese Datei mit „?v=3“. Der Browser würde
 *    importierte Module aber OHNE diese Angabe zwischenspeichern. Deshalb
 *    lädt dieses Modul alles per import() und hängt dieselbe Versionsangabe
 *    an. Damit das zuverlässig klappt, importieren die Module in core/ und
 *    sections/ selbst NICHTS – sie bekommen alles über `ctx`.
 *
 *  Typische Anpassungen:
 *    - Aufbau des Zeitungskopfs: _mastheadHtml()
 *    - Regeln für den Aufmacher: _buildPage()
 *    - Aktualisierungsintervall: TICK_MS
 * ============================================================================
 */

// Versionsangabe (z. B. „?v=3“) aus der eigenen URL – wird an alle Importe gehängt.
const VERSION_QUERY = new URL(import.meta.url).search;

// ✏️ ANPASSEN: Wie oft geprüft wird, ob eine neue Minute begonnen hat.
const TICK_MS = 15000;
// Wie lange nach dem Schalten ein Bedienelement kurz aufleuchtet.
const FLASH_MS = 2500;

/**
 * Lädt ein Modul relativ zu dieser Datei, inklusive Versionsangabe.
 *
 * @param {string} path  z. B. './config.js'
 * @returns {Promise<object>} Modul-Namespace
 * @example const cfg = (await load('./config.js')).default;
 */
function load(path) {
  return import(new URL(path, import.meta.url).href + VERSION_QUERY);
}

// Stil für Lade- und Fehleranzeige – muss ohne theme.js auskommen.
const BOOT_CSS = `
  .status-page { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;
    height:100vh; padding:24px; box-sizing:border-box; background:#f4efe4; color:#1d1b18;
    font-family:Georgia,"Times New Roman",serif; text-align:center; }
  .status-page h1 { margin:0; font-size:28px; }
  .status-page pre { max-width:90vw; white-space:pre-wrap; text-align:left; font-size:13px; }
`;

class NewspaperPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._renderedHass = null;  // hass-Stand beim letzten Zeichnen (für den Vergleich)
    this._narrow = false;
    this._ready = false;
    this._initPromise = null;
    this._sections = [];        // [{ entry, plugin, error }]
    this._watched = new Set();
    this._forecastWanted = [];
    this._openPopovers = 0;     // offene Inline-Auswahllisten → Neuzeichnen aufschieben
    this._dirty = false;
    this._timer = null;
    this._lastMinute = -1;
    this._recent = new Map();   // entity_id → Zeitpunkt des letzten Schaltens

    // Ereignisse der Bedienelemente (core/controls.js)
    this.shadowRoot.addEventListener('np-call', (e) => this._onCall(e));
    this.shadowRoot.addEventListener('np-popover', (e) => this._onPopover(e));
    this.shadowRoot.addEventListener('click', (e) => {
      if (e.target.closest?.('[data-action="menu"]')) this._toggleMenu();
    });
  }

  /* -------------------------------------------------------------------------
   *  Properties, die Home Assistant setzt
   * ----------------------------------------------------------------------- */

  /**
   * Wird von HA bei JEDER Zustandsänderung im ganzen Haus gesetzt – oft
   * mehrmals pro Sekunde. Deshalb wird hier nur verglichen und nur bei
   * Bedarf gezeichnet.
   *
   * @param {object} hass
   */
  set hass(hass) {
    this._hass = hass;
    // Ausgehängt (anderes Panel geöffnet): nichts tun, keine neuen Abos.
    if (!this._ready || !this.isConnected) return;
    this._forecasts.sync(hass, this._forecastWanted);
    if (this._ent.changed(this._renderedHass, hass, this._watched)) this._render();
  }

  get hass() {
    return this._hass;
  }

  /** @param {boolean} narrow  true auf schmalen Geräten (Seitenleiste eingeklappt) */
  set narrow(narrow) {
    const value = Boolean(narrow);
    if (value === this._narrow) return;
    this._narrow = value;
    if (this._ready) this._render();
  }

  get narrow() {
    return this._narrow;
  }

  /** @param {object} panel  Panel-Konfiguration aus configuration.yaml */
  set panel(panel) {
    this._panel = panel;
  }

  get panel() {
    return this._panel;
  }

  /* -------------------------------------------------------------------------
   *  Lebenszyklus
   * ----------------------------------------------------------------------- */

  connectedCallback() {
    this._openPopovers = 0;
    this._timer = setInterval(() => {
      // Einmal pro Minute neu zeichnen: „Stand“-Uhrzeit, „heute/morgen“ nach
      // Mitternacht und tageszeitabhängige Prioritäten (Müll am Abend).
      if (new Date().getMinutes() !== this._lastMinute) this._render();
    }, TICK_MS);

    if (!this._initPromise) {
      this._initPromise = this._init();
    } else if (this._ready && this._hass) {
      // Panel wurde wieder eingehängt: Abos erneuern und aktuell zeichnen.
      this._forecasts.sync(this._hass, this._forecastWanted);
      this._render();
    }
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
    // Vorhersage-Abos sauber beenden (Vorgabe: keine verwaisten Abos).
    this._forecasts?.dispose();
  }

  /**
   * Lädt Konfiguration, Kernmodule und Rubriken.
   *
   * @returns {Promise<void>}
   */
  async _init() {
    this._showStatus('Die Druckerpresse läuft an …');

    try {
      const [config, fmt, text, ent, forecast, controls, theme] = await Promise.all([
        load('./config.js'),
        load('./core/format.js'),
        load('./core/text-engine.js'),
        load('./core/entities.js'),
        load('./core/forecast.js'),
        load('./core/controls.js'),
        load('./core/theme.js'),
      ]);
      this._cfg = config.default ?? {};
      this._fmt = fmt;
      this._text = text;
      this._ent = ent;
      this._controls = controls;
      this._theme = theme;
      this._forecasts = new forecast.ForecastStore(() => this._render());
    } catch (err) {
      // Häufigster Fall: Tippfehler in config.js → verständlich anzeigen.
      this._showStatus('Die Hauszeitung konnte nicht gedruckt werden.', err);
      console.error('[Hauszeitung]', err);
      return;
    }

    this._controls.defineControls();

    // Grundgerüst einmalig anlegen; später wird nur .page neu befüllt.
    this.shadowRoot.innerHTML = `<style>${this._theme.styles}</style>
      <div class="page" lang="de"></div>
      <div class="toast" role="status" aria-live="polite"></div>`;
    this._page = this.shadowRoot.querySelector('.page');
    this._toast = this.shadowRoot.querySelector('.toast');

    // Rubriken laden. Eine defekte Rubrik legt nicht das ganze Blatt lahm.
    const entries = (this._cfg.sections ?? []).filter((s) => s && s.enabled !== false);
    this._sections = await Promise.all(entries.map(async (entry) => {
      try {
        const plugin = (await load(entry.module)).default;
        if (!plugin || (typeof plugin.renderArticle !== 'function' && typeof plugin.renderFactbox !== 'function')) {
          throw new Error('Keine gültige Rubrik (fehlt „export default { … }“?)');
        }
        return { entry, plugin, error: null };
      } catch (err) {
        console.error(`[Hauszeitung] Rubrik „${entry.id}“ (${entry.module}) nicht ladbar:`, err);
        return { entry, plugin: null, error: err };
      }
    }));

    this._collectDependencies();
    this._ready = true;
    if (this._hass) {
      this._forecasts.sync(this._hass, this._forecastWanted);
      this._render();
    }
  }

  /**
   * Sammelt alle beobachteten Entitäten und benötigten Vorhersagen.
   *
   * @returns {void}
   */
  _collectDependencies() {
    const watched = new Set();
    const forecasts = new Map();
    const add = (id) => { if (typeof id === 'string' && id) watched.add(id); };
    const addForecast = (f) => {
      if (f?.entity_id) forecasts.set(`${f.entity_id}|${f.type ?? 'daily'}`, { entity_id: f.entity_id, type: f.type ?? 'daily' });
    };

    add(this._cfg.theme?.sunEntity ?? 'sun.sun');
    add(this._cfg.header?.weatherEntity);
    addForecast({ entity_id: this._cfg.header?.weatherEntity, type: 'daily' });

    for (const s of this._sections) {
      if (!s.plugin) continue;
      (this._safe(s, 'getWatchedEntities', () => s.plugin.getWatchedEntities?.(s.entry)) ?? []).forEach(add);
      (this._safe(s, 'getForecasts', () => s.plugin.getForecasts?.(s.entry)) ?? []).forEach(addForecast);
    }
    this._watched = watched;
    this._forecastWanted = [...forecasts.values()];
  }

  /* -------------------------------------------------------------------------
   *  Zeichnen
   * ----------------------------------------------------------------------- */

  /**
   * Kontext-Objekt für die Rubriken: alle Werkzeuge an einer Stelle.
   *
   * @param {Date} now
   * @returns {object} ctx
   */
  _context(now) {
    const text = this._text;
    const controls = this._controls;
    // Bedienelemente leuchten kurz auf, wenn sie gerade geschaltet wurden.
    const flash = (entity) => Date.now() - (this._recent.get(entity) ?? 0) < FLASH_MS;
    return {
      now,                                   // aktueller Zeitpunkt
      config: this._cfg,                     // gesamte config.js
      fmt: this._fmt,                        // Zahlen/Datum (core/format.js)
      text,                                  // Textbausteine (core/text-engine.js)
      ent: this._ent,                        // Entitätenzugriff (core/entities.js)
      esc: text.esc,
      raw: text.raw,
      /** Baustein holen, Variante wählen, füllen → HTML */
      say: (texts, key, vars = {}) => text.say(texts, key, vars, now),
      /** Wettervorhersage (Array) oder null */
      forecast: (entityId, type = 'daily') => this._forecasts.get(entityId, type),
      /** Hinweis „noch nicht eingerichtet“ als Absatz */
      notConfiguredHtml: () => `<p class="np-hint">${text.esc(this._cfg.texts?.notConfigured ?? '')}</p>`,
      /** Bedienelemente (core/controls.js) */
      ui: {
        optionsFrom: controls.optionsFrom,
        labelFor: controls.labelFor,
        toggle: (o) => controls.toggle({ ...o, flash: flash(o.entity) }),
        choice: (o) => controls.choice({ ...o, flash: flash(o.entity) }),
        inlineSelect: (o) => controls.inlineSelect({ ...o, flash: flash(o.entity) }),
        inlineToggle: (o) => controls.inlineToggle({ ...o, flash: flash(o.entity) }),
      },
    };
  }

  /**
   * Zeichnet das komplette Blatt neu.
   *
   * @returns {void}
   */
  _render() {
    const hass = this._hass;
    if (!this._ready || !hass || !this._page) return;
    // Solange eine Inline-Auswahl offen ist, nicht neu zeichnen – sonst
    // verschwindet sie unter dem Finger. Wird beim Schließen nachgeholt.
    if (this._openPopovers > 0) {
      this._dirty = true;
      return;
    }
    this._dirty = false;
    this._renderedHass = hass;
    const now = new Date();
    this._lastMinute = now.getMinutes();

    const sunState = this._ent.state(hass, this._cfg.theme?.sunEntity ?? 'sun.sun');
    const theme = this._theme.resolveTheme(this._cfg.theme?.mode ?? 'auto', sunState);
    if (this.getAttribute('data-theme') !== theme) this.setAttribute('data-theme', theme);

    const ctx = this._context(now);
    this._page.innerHTML = this._mastheadHtml(hass, ctx) + this._buildPage(hass, ctx);
  }

  /**
   * Führt eine Rubrik-Funktion abgesichert aus: Fehler landen in der
   * Konsole, das Blatt wird trotzdem gedruckt.
   *
   * @param {{entry: object}} section
   * @param {string} what  Name der Funktion (für die Fehlermeldung)
   * @param {() => *} fn
   * @param {*} [fallback=null]
   * @returns {*}
   */
  _safe(section, what, fn, fallback = null) {
    try {
      return fn();
    } catch (err) {
      console.error(`[Hauszeitung] Rubrik „${section.entry?.id}“, ${what}():`, err);
      return fallback;
    }
  }

  /**
   * Spalten mit Aufmacher, weiteren Artikeln und Randspalte.
   *
   * @param {object} hass
   * @param {object} ctx
   * @returns {string} HTML
   */
  _buildPage(hass, ctx) {
    const { esc } = this._text;
    const texts = this._cfg.texts ?? {};

    const sections = this._sections.map((s, index) => ({
      ...s,
      index,
      priority: s.plugin ? Number(this._safe(s, 'getPriority', () => s.plugin.getPriority?.(hass, s.entry, ctx))) || 0 : -1,
    }));

    // Artikel abgesichert erzeugen; bei Fehler erscheint ein Hinweis statt Absturz.
    const article = (s, lead) => {
      const result = this._safe(s, 'renderArticle', () => s.plugin.renderArticle(hass, s.entry, ctx, { lead }), 'error');
      if (result === 'error') {
        return { headline: esc(this._kicker(s)), html: `<p class="np-error">${esc(texts.sectionError)}</p>` };
      }
      return result;
    };

    // Aufmacher: höchste Priorität; bei Gleichstand gewinnt die Reihenfolge
    // in config.js. Liefert der Favorit keinen Artikel, kommt der nächste dran.
    const candidates = sections
      .filter((s) => typeof s.plugin?.renderArticle === 'function')
      .sort((a, b) => b.priority - a.priority || a.index - b.index);
    let lead = null;
    for (const s of candidates) {
      const a = article(s, true);
      if (a) {
        lead = { section: s, article: a };
        break;
      }
    }

    const more = sections
      .filter((s) => typeof s.plugin?.renderArticle === 'function' && s !== lead?.section)
      .map((s) => ({ section: s, article: article(s, false) }))
      .filter((x) => x.article);

    // Faktenboxen: standardmäßig in die Leiste „Kurz notiert“ unter den
    // Artikeln; mit placement: 'rail' (z. B. Schaltkasten) in die rechte
    // Randspalte. In config.js per `factboxPlacement` überschreibbar.
    const notes = [];
    const rail = [];
    for (const s of sections) {
      if (!s.plugin) {
        const msg = this._text.fill(texts.loadError ?? '{id}: {msg}', { id: s.entry.id, msg: s.error?.message ?? String(s.error) });
        notes.push(`<section class="factbox"><p class="np-error">${msg}</p></section>`);
        continue;
      }
      if (typeof s.plugin.renderFactbox !== 'function') continue;
      const box = this._safe(s, 'renderFactbox', () => s.plugin.renderFactbox(hass, s.entry, ctx));
      if (!box) continue;
      const html = `<section class="factbox" data-section="${esc(s.entry.id)}">
          ${box.title ? `<h3 class="factbox-title">${esc(box.title)}</h3>` : ''}${box.html}
        </section>`;
      ((s.entry.factboxPlacement ?? box.placement) === 'rail' ? rail : notes).push(html);
    }

    const leadHtml = lead ? this._articleHtml(lead.section, lead.article, true) : '';
    const moreHtml = more.map((x) => this._articleHtml(x.section, x.article, false)).join('');
    const layout = [moreHtml ? '' : 'no-more', rail.length ? '' : 'no-rail'].join(' ');

    return `<main class="columns ${layout}">
        <section class="col-lead">${leadHtml}</section>
        ${moreHtml ? `<section class="col-more">${moreHtml}</section>` : ''}
        ${notes.length ? `<section class="notes">
            <h2 class="notes-title">${esc(texts.notesTitle ?? 'Kurz notiert')}</h2>
            <div class="notes-grid">${notes.join('')}</div>
          </section>` : ''}
        ${rail.length ? `<aside class="col-rail">${rail.join('')}</aside>` : ''}
      </main>`;
  }

  /**
   * Dachzeile einer Rubrik: Eintrag in config.js hat Vorrang vor dem Plugin.
   *
   * @param {{entry: object, plugin: object}} s
   * @returns {string}
   */
  _kicker(s) {
    return s.entry.kicker ?? s.plugin?.kicker ?? '';
  }

  /**
   * HTML eines Artikels.
   *
   * @param {object} s        Rubrik
   * @param {{headline: string, html: string}} a  Ergebnis von renderArticle (HTML)
   * @param {boolean} isLead  Aufmacher?
   * @returns {string}
   */
  _articleHtml(s, a, isLead) {
    const { esc } = this._text;
    const kicker = this._kicker(s);
    return `<article class="article ${isLead ? 'lead' : ''}" data-section="${esc(s.entry.id)}">
        ${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ''}
        ${a.headline ? `<h2 class="headline">${a.headline}</h2>` : ''}
        <div class="body">${a.html ?? ''}</div>
      </article>`;
  }

  /**
   * Zeitungskopf: Datum, Ausgabe, Titel, Mini-Wetter.
   *
   * @param {object} hass
   * @param {object} ctx
   * @returns {string} HTML
   */
  _mastheadHtml(hass, ctx) {
    const { esc, fill } = this._text;
    const fmt = this._fmt;
    const cfg = this._cfg;
    const texts = cfg.texts ?? {};
    const now = ctx.now;

    const volume = cfg.foundedYear
      ? ` · ${fill(texts.volume ?? '{n}. Jahrgang', { n: now.getFullYear() - cfg.foundedYear + 1 })}`
      : '';
    const edition = fill(texts.edition ?? 'Ausgabe Nr. {nr}', { nr: fmt.dayOfYear(now) });
    const updated = fill(texts.updated ?? 'Stand {zeit}', { zeit: fmt.time(now) });

    // Menü-Knopf nur auf schmalen Geräten: dort ist die HA-Seitenleiste
    // eingeklappt und ein eigenes Panel muss sie selbst öffnen können.
    const menu = this._narrow
      ? '<button class="menu-btn" data-action="menu" aria-label="Seitenleiste öffnen">☰</button>'
      : '';

    return `<header class="masthead">
        <div class="ear ear-left">
          <div class="ear-left-row">${menu}<strong>${esc(fmt.dateLong(now))}</strong></div>
          <span>${edition}${volume}</span>
        </div>
        <div class="title-block">
          <h1 class="title">${esc(cfg.title ?? 'Die Hauszeitung')}</h1>
          ${cfg.motto ? `<p class="motto">${esc(cfg.motto)}</p>` : ''}
        </div>
        <div class="ear ear-right">
          ${this._miniWeatherHtml(hass, ctx)}
          <span>${updated}</span>
        </div>
      </header>`;
  }

  /**
   * Mini-Wetter für den Kopf: Symbol, aktuelle Temperatur, Tagesspanne.
   *
   * @param {object} hass
   * @param {object} ctx
   * @returns {string} HTML (leer, wenn keine Daten)
   */
  _miniWeatherHtml(hass, ctx) {
    const id = this._cfg.header?.weatherEntity;
    const w = this._ent.valid(hass, id);
    if (!w) return '';
    const { esc } = this._text;
    const fmt = this._fmt;
    const cond = this._cfg.weatherConditions?.[w.state];
    const today = (ctx.forecast(id, 'daily') ?? []).find((f) => {
      const d = fmt.toDate(f.datetime);
      return d && fmt.daysBetween(ctx.now, d) === 0;
    });
    const range = today && fmt.toNumber(today.temperature) !== null
      ? `<span class="mini-range">${esc(fmt.number(today.templow))} bis ${esc(fmt.temp(today.temperature))}</span>`
      : '';
    return `<span class="mini-weather" title="${esc(cond?.label ?? w.state)}">
        <span class="symbol" aria-hidden="true">${esc(cond?.symbol ?? '')}</span>
        <strong>${esc(fmt.temp(w.attributes?.temperature))}</strong>
      </span>${range}`;
  }

  /**
   * Status- oder Fehlerseite (vor dem Laden des Stylesheets).
   *
   * @param {string} message
   * @param {Error} [err]
   * @returns {void}
   */
  _showStatus(message, err) {
    const e = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    this.shadowRoot.innerHTML = `<style>${BOOT_CSS}</style>
      <div class="status-page">
        <h1>${e(message)}</h1>
        ${err ? `<p>Meist ein Tippfehler in <code>config.js</code> (fehlendes Komma, Anführungszeichen). Details:</p>
          <pre>${e(err.stack || err.message || err)}</pre>` : ''}
      </div>`;
  }

  /* -------------------------------------------------------------------------
   *  Schalten & Rückmeldung
   * ----------------------------------------------------------------------- */

  /**
   * Führt den Dienstaufruf eines Bedienelements aus.
   *
   * @param {CustomEvent<{domain: string, service: string, data: object}>} e
   * @returns {Promise<void>}
   */
  async _onCall(e) {
    e.stopPropagation();
    const { domain, service, data } = e.detail ?? {};
    const control = e.target;
    const texts = this._cfg.texts ?? {};
    if (!this._hass || !domain || !service) return;

    this._showToast(texts.toastPending ?? '…', 'pending');
    try {
      await this._hass.callService(domain, service, data);
      if (data?.entity_id) this._recent.set(data.entity_id, Date.now());
      this._showToast(texts.toastOk ?? 'OK', 'ok', 1600);
    } catch (err) {
      control?.removeAttribute?.('pending');
      this._showToast(this._text.fill(texts.toastError ?? '{msg}', { msg: err?.message ?? String(err) }), 'error', 4500);
      // Optimistisch umgelegte Schalter auf den echten Zustand zurücksetzen.
      this._render();
    }
  }

  /**
   * Merkt sich offene Inline-Auswahllisten.
   *
   * @param {CustomEvent<{open: boolean}>} e
   * @returns {void}
   */
  _onPopover(e) {
    e.stopPropagation();
    this._openPopovers = Math.max(0, this._openPopovers + (e.detail?.open ? 1 : -1));
    if (this._openPopovers === 0 && this._dirty) this._render();
  }

  /**
   * Kurze Meldung am unteren Rand.
   *
   * @param {string} message
   * @param {'pending'|'ok'|'error'} kind
   * @param {number} [hideAfterMs]  ohne Angabe bleibt sie stehen (bis zur nächsten)
   * @returns {void}
   */
  _showToast(message, kind, hideAfterMs) {
    if (!this._toast) return;
    clearTimeout(this._toastTimer);
    this._toast.textContent = message;
    this._toast.className = `toast show ${kind}`;
    // Sicherheitsnetz: auch „pending“ verschwindet spätestens nach 10 s.
    this._toastTimer = setTimeout(() => { this._toast.className = 'toast'; }, hideAfterMs ?? 10000);
  }

  /**
   * Öffnet die HA-Seitenleiste (auf schmalen Geräten).
   *
   * @returns {void}
   */
  _toggleMenu() {
    this.dispatchEvent(new Event('hass-toggle-menu', { bubbles: true, composed: true }));
  }
}

// Der Elementname muss mit `name:` in configuration.yaml übereinstimmen.
if (!customElements.get('newspaper-panel')) {
  customElements.define('newspaper-panel', NewspaperPanel);
}
