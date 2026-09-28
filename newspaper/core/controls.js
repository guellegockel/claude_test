/**
 * ============================================================================
 *  core/controls.js – Schalter: klassisch und inline im Fließtext
 * ============================================================================
 *
 *  Zweck:
 *    Wiederverwendbare Web Components für alle Bedienelemente:
 *
 *      <np-toggle>         Klassischer Kippschalter (Schaltkasten, Faktenbox)
 *      <np-choice>         Segment-Auswahl, z. B. Lademodi (Faktenbox)
 *      <np-inline-select>  Antippbares Wort im Fließtext → kleine Auswahl
 *                          („lädt im Modus ›Smart‹“)
 *      <np-inline-toggle>  Antippbares Wort, das direkt umschaltet
 *                          („Das Flurlicht ist ›an‹“)
 *
 *    Die Komponenten rufen Home Assistant NICHT selbst auf. Sie feuern ein
 *    Ereignis `np-call` mit { domain, service, data }; das Panel führt den
 *    Dienst aus und zeigt Rückmeldung. So bleibt der Zugriff auf `hass` an
 *    einer Stelle.
 *
 *    Zusätzlich gibt es Hilfsfunktionen (toggle(), choice(), inlineSelect(),
 *    inlineToggle(), optionsFrom()), die das passende HTML erzeugen. Rubriken
 *    nutzen sie über `ctx.ui`.
 *
 *  Abhängigkeiten:
 *    Keine. Farben kommen über die CSS-Variablen aus core/theme.js, die
 *    durch die Shadow-DOM-Grenze hindurch vererbt werden.
 *
 *  Typische Anpassungen:
 *    - Aussehen: die CSS-Blöcke *_CSS in dieser Datei
 *    - Automatisches Schließen der Inline-Auswahl: POPOVER_TIMEOUT_MS
 *    - Wie lange ein Schalter „arbeitet“ anzeigt: PENDING_TIMEOUT_MS
 * ============================================================================
 */

// ✏️ ANPASSEN: Inline-Auswahl schließt sich nach dieser Zeit ohne Eingabe.
const POPOVER_TIMEOUT_MS = 20000;
// Spätestens nach dieser Zeit endet die „arbeitet …“-Animation, auch wenn
// HA keine Zustandsänderung meldet (z. B. Gerät nicht erreichbar).
const PENDING_TIMEOUT_MS = 8000;

/* ---------------------------------------------------------------------------
 *  Hilfsfunktionen
 * ------------------------------------------------------------------------- */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * HTML/Attribut-Maskierung. (Bewusst eine Kopie aus text-engine.js, damit
 * dieses Modul keine Importe braucht – siehe README „Cache-Busting“.)
 *
 * @param {*} value
 * @returns {string}
 */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Feuert ein Ereignis, das aus dem Shadow DOM bis zum Panel durchdringt.
 *
 * @param {HTMLElement} el
 * @param {string} type
 * @param {object} detail
 * @returns {void}
 */
function fire(el, type, detail) {
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

/**
 * Liest die Optionen [{value, label}] aus dem JSON-Attribut `options`.
 *
 * @param {HTMLElement} el
 * @returns {Array<{value: string, label: string}>}
 */
function readOptions(el) {
  try {
    const parsed = JSON.parse(el.getAttribute('options') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Dienstaufruf für die Auswahl einer Option (select / input_select).
 *
 * @param {string} entityId
 * @param {string} option
 * @returns {{domain: string, service: string, data: object}}
 */
function selectCall(entityId, option) {
  const domain = String(entityId).startsWith('input_select.') ? 'input_select' : 'select';
  return { domain, service: 'select_option', data: { entity_id: entityId, option } };
}

/**
 * Dienstaufruf zum Umschalten. homeassistant.toggle funktioniert für
 * light, switch, input_boolean, fan usw. gleichermaßen.
 *
 * @param {string} entityId
 * @returns {{domain: string, service: string, data: object}}
 */
function toggleCall(entityId) {
  return { domain: 'homeassistant', service: 'toggle', data: { entity_id: entityId } };
}

/**
 * Setzt den „arbeitet …“-Zustand mit Sicherheits-Timeout.
 *
 * @param {HTMLElement & {_pendingTimer?: number}} el
 * @returns {void}
 */
function markPending(el) {
  el.setAttribute('pending', '');
  clearTimeout(el._pendingTimer);
  el._pendingTimer = setTimeout(() => el.removeAttribute('pending'), PENDING_TIMEOUT_MS);
}

/* ---------------------------------------------------------------------------
 *  Gemeinsame CSS-Bausteine
 * ------------------------------------------------------------------------- */

// Animationen: „pending“ = pulsiert, solange geschaltet wird;
// „flash“ = kurzes Aufleuchten nach erfolgreichem Schalten.
const ANIM_CSS = `
  @keyframes np-pulse { 50% { opacity: .45; } }
  @keyframes np-flash { from { background-color: var(--np-highlight, rgba(158,32,22,.18)); } to { background-color: transparent; } }
`;

// Inline-Wörter: gepunktete Unterstreichung = dezent, aber als antippbar erkennbar.
const INLINE_CSS = `
  :host { display: inline; }
  .word {
    all: unset;
    position: relative;
    cursor: pointer;
    font: inherit;
    color: inherit;
    border-bottom: 2px dotted var(--np-accent, #9e2016);
    padding: 0 .05em;
    -webkit-tap-highlight-color: transparent;
    transition: background-color .3s;
  }
  /* Unsichtbar vergrößerte Trefferfläche: mind. 48 px hoch, obwohl das Wort
     selbst nur eine Textzeile hoch ist. */
  .word::after {
    content: '';
    position: absolute;
    left: -6px; right: -6px; top: 50%;
    height: var(--np-touch, 48px);
    transform: translateY(-50%);
  }
  .word:focus-visible { outline: 2px solid var(--np-accent, #9e2016); outline-offset: 2px; }
  .word:disabled { cursor: default; border-bottom-style: solid; border-bottom-color: var(--np-rule-soft, #ccc); }
  :host([pending]) .word { animation: np-pulse .9s ease-in-out infinite; }
  :host([flash]) .word { animation: np-flash 1.6s ease-out; }
  ${ANIM_CSS}
`;

/* ---------------------------------------------------------------------------
 *  <np-toggle> – klassischer Kippschalter
 *  Attribute: entity, state ("on"|"off"), label, note, disabled, flash
 * ------------------------------------------------------------------------- */

const TOGGLE_CSS = `
  :host { display: block; }
  button {
    all: unset;
    box-sizing: border-box;
    display: flex; align-items: center; gap: .7em;
    width: 100%;
    min-height: var(--np-touch, 48px);
    padding: .25em .1em;
    cursor: pointer;
    font-family: var(--np-font-sans, sans-serif);
    color: var(--np-ink, #222);
    border-bottom: 1px solid var(--np-rule-soft, #ccc);
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible { outline: 2px solid var(--np-accent, #9e2016); outline-offset: -2px; }
  button:disabled { cursor: default; opacity: .5; }
  .label { flex: 1; }
  .note { font-size: .78em; letter-spacing: .06em; text-transform: uppercase; color: var(--np-ink-soft, #666); }
  .track {
    flex: none; position: relative;
    width: 2.7em; height: 1.5em; border-radius: 1em;
    background: var(--np-rule-soft, #ccc);
    transition: background-color .25s;
  }
  .knob {
    position: absolute; top: .18em; left: .18em;
    width: 1.14em; height: 1.14em; border-radius: 50%;
    background: var(--np-paper, #fff);
    box-shadow: 0 1px 2px rgba(0,0,0,.35);
    transition: transform .25s;
  }
  button[aria-checked="true"] .track { background: var(--np-accent, #9e2016); }
  button[aria-checked="true"] .knob { transform: translateX(1.2em); }
  :host([pending]) .track { animation: np-pulse .9s ease-in-out infinite; }
  :host([flash]) button { animation: np-flash 1.6s ease-out; }
  ${ANIM_CSS}
`;

class NpToggle extends HTMLElement {
  static get observedAttributes() {
    return ['state', 'label', 'note', 'disabled'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('click', () => this._onClick());
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  /** @returns {boolean} Ist der Schalter (laut Attribut) an? */
  get on() {
    return this.getAttribute('state') === 'on';
  }

  /** Zeichnet den Schalter. @returns {void} */
  _render() {
    const on = this.on;
    const disabled = this.hasAttribute('disabled');
    const note = this.getAttribute('note') ?? (on ? 'an' : 'aus');
    this.shadowRoot.innerHTML = `<style>${TOGGLE_CSS}</style>
      <button type="button" role="switch" aria-checked="${on}" ${disabled ? 'disabled' : ''}>
        <span class="label">${esc(this.getAttribute('label'))}</span>
        <span class="note">${esc(note)}</span>
        <span class="track" aria-hidden="true"><span class="knob"></span></span>
      </button>`;
  }

  /** Klick: optimistisch umschalten und Dienstaufruf anfordern. @returns {void} */
  _onClick() {
    const entity = this.getAttribute('entity');
    if (!entity || this.hasAttribute('disabled') || this.hasAttribute('pending')) return;
    // Optimistische Anzeige: fühlt sich sofort an. Schlägt der Aufruf fehl,
    // zeichnet das Panel neu und stellt den echten Zustand wieder her.
    this.setAttribute('state', this.on ? 'off' : 'on');
    this.removeAttribute('note');
    markPending(this);
    fire(this, 'np-call', toggleCall(entity));
  }
}

/* ---------------------------------------------------------------------------
 *  <np-choice> – Segment-Auswahl (mehrere Knöpfe nebeneinander)
 *  Attribute: entity, value, options (JSON [{value,label}]), disabled, flash
 * ------------------------------------------------------------------------- */

const CHOICE_CSS = `
  :host { display: block; }
  .seg { display: flex; flex-wrap: wrap; gap: 4px; }
  button {
    all: unset;
    box-sizing: border-box;
    flex: 1 1 auto;
    min-height: var(--np-touch, 48px);
    padding: 0 .8em;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    font-family: var(--np-font-sans, sans-serif);
    font-size: .92em;
    color: var(--np-ink, #222);
    border: 1px solid var(--np-rule-soft, #ccc);
    border-radius: 3px;
    transition: background-color .25s, color .25s;
    -webkit-tap-highlight-color: transparent;
  }
  button[aria-pressed="true"] { background: var(--np-ink, #222); color: var(--np-paper, #fff); border-color: var(--np-ink, #222); }
  button:focus-visible { outline: 2px solid var(--np-accent, #9e2016); outline-offset: 2px; }
  button:disabled { cursor: default; opacity: .5; }
  :host([pending]) button[aria-pressed="true"] { animation: np-pulse .9s ease-in-out infinite; }
  :host([flash]) .seg { animation: np-flash 1.6s ease-out; }
  ${ANIM_CSS}
`;

class NpChoice extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'options', 'disabled'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('click', (e) => {
      const btn = e.target.closest?.('button[data-value]');
      if (btn) this._choose(btn.dataset.value);
    });
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  /** Zeichnet die Knöpfe. @returns {void} */
  _render() {
    const value = this.getAttribute('value');
    const disabled = this.hasAttribute('disabled');
    const buttons = readOptions(this).map((o) => `
      <button type="button" data-value="${esc(o.value)}" aria-pressed="${o.value === value}"
        ${disabled ? 'disabled' : ''}>${esc(o.label)}</button>`).join('');
    this.shadowRoot.innerHTML = `<style>${CHOICE_CSS}</style><div class="seg" role="group">${buttons}</div>`;
  }

  /**
   * Option gewählt.
   * @param {string} option
   * @returns {void}
   */
  _choose(option) {
    const entity = this.getAttribute('entity');
    if (!entity || this.hasAttribute('disabled') || option === this.getAttribute('value')) return;
    this.setAttribute('value', option); // optimistisch
    markPending(this);
    fire(this, 'np-call', selectCall(entity, option));
  }
}

/* ---------------------------------------------------------------------------
 *  <np-inline-select> – antippbares Wort mit kleiner Auswahlliste
 *  Attribute: entity, value, options (JSON [{value,label}]), disabled, flash
 *
 *  Während die Liste offen ist, meldet das Element `np-popover` {open:true}.
 *  Das Panel zeichnet dann nicht neu (sonst würde die Liste unter dem Finger
 *  verschwinden) und holt das Neuzeichnen beim Schließen nach.
 * ------------------------------------------------------------------------- */

const SELECT_CSS = `
  ${INLINE_CSS}
  .pop {
    position: fixed; /* fixed: wird von keiner Spalte abgeschnitten */
    z-index: 30;
    min-width: 11em;
    padding: 4px 0;
    background: var(--np-paper, #fff);
    color: var(--np-ink, #222);
    border: 1px solid var(--np-rule, #333);
    box-shadow: var(--np-shadow, 0 6px 24px rgba(0,0,0,.25));
    font-family: var(--np-font-sans, sans-serif);
    font-size: .95rem;
    font-style: normal;
  }
  .pop[hidden] { display: none; }
  .pop-title {
    padding: .4em 1em .2em;
    font-size: .72em; letter-spacing: .12em; text-transform: uppercase;
    color: var(--np-ink-soft, #666);
  }
  .opt {
    all: unset; box-sizing: border-box;
    display: flex; align-items: center; gap: .6em;
    width: 100%;
    min-height: var(--np-touch, 48px);
    padding: 0 1em;
    cursor: pointer;
  }
  .opt::before { content: ''; width: 1em; text-align: center; }
  .opt[aria-selected="true"] { font-weight: 700; }
  .opt[aria-selected="true"]::before { content: '✓'; color: var(--np-accent, #9e2016); }
  .opt:hover, .opt:focus-visible { background: var(--np-paper-2, #eee); }
`;

class NpInlineSelect extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'options', 'disabled'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = false;
    // Klick außerhalb schließt die Liste. composedPath() durchschaut Shadow-Grenzen.
    this._onOutside = (e) => {
      if (!e.composedPath().includes(this)) this.close();
    };
    this._onViewportChange = () => this.close();
    this.shadowRoot.addEventListener('click', (e) => {
      const btn = e.target.closest?.('button');
      if (!btn) return;
      if (btn.classList.contains('word')) this._open ? this.close() : this.open();
      else if (btn.dataset.value !== undefined) this._choose(btn.dataset.value);
    });
  }

  connectedCallback() {
    this._render();
  }

  disconnectedCallback() {
    this._removeListeners();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  /** Zeichnet Wort und (versteckte) Liste. @returns {void} */
  _render() {
    const value = this.getAttribute('value');
    const options = readOptions(this);
    const current = options.find((o) => o.value === value);
    const label = current?.label ?? value ?? '–';
    const disabled = this.hasAttribute('disabled') || options.length === 0;
    const items = options.map((o) => `
      <button type="button" class="opt" role="option" data-value="${esc(o.value)}"
        aria-selected="${o.value === value}">${esc(o.label)}</button>`).join('');
    const title = this.getAttribute('title-text');
    // Achtung: keine Zeilenumbrüche zwischen den Tags – das Element steht im
    // Fließtext, jeder Umbruch würde dort als Leerzeichen sichtbar („› PV ‹“).
    this.shadowRoot.innerHTML = `<style>${SELECT_CSS}</style>`
      + `<button type="button" class="word" aria-haspopup="listbox" aria-expanded="${this._open}"`
      + ` ${disabled ? 'disabled' : ''}>${esc(label)}</button>`
      + `<div class="pop" role="listbox" ${this._open ? '' : 'hidden'}>`
      + `${title ? `<div class="pop-title">${esc(title)}</div>` : ''}${items}</div>`;
    if (this._open) this._position();
  }

  /** Öffnet die Auswahlliste. @returns {void} */
  open() {
    if (this._open || this.hasAttribute('disabled')) return;
    this._open = true;
    this._render();
    document.addEventListener('pointerdown', this._onOutside, true);
    window.addEventListener('resize', this._onViewportChange);
    window.addEventListener('scroll', this._onViewportChange, true);
    clearTimeout(this._autoClose);
    this._autoClose = setTimeout(() => this.close(), POPOVER_TIMEOUT_MS);
    fire(this, 'np-popover', { open: true });
  }

  /** Schließt die Auswahlliste. @returns {void} */
  close() {
    if (!this._open) return;
    this._open = false;
    this._removeListeners();
    const pop = this.shadowRoot.querySelector('.pop');
    if (pop) pop.hidden = true;
    this.shadowRoot.querySelector('.word')?.setAttribute('aria-expanded', 'false');
    fire(this, 'np-popover', { open: false });
  }

  /** @returns {void} */
  _removeListeners() {
    clearTimeout(this._autoClose);
    document.removeEventListener('pointerdown', this._onOutside, true);
    window.removeEventListener('resize', this._onViewportChange);
    window.removeEventListener('scroll', this._onViewportChange, true);
  }

  /**
   * Positioniert die Liste unter dem Wort; passt sie nicht, darüber bzw.
   * nach links verschoben.
   * @returns {void}
   */
  _position() {
    const word = this.shadowRoot.querySelector('.word');
    const pop = this.shadowRoot.querySelector('.pop');
    if (!word || !pop) return;
    const r = word.getBoundingClientRect();
    const margin = 8;
    pop.style.left = `${Math.max(margin, r.left)}px`;
    pop.style.top = `${r.bottom + 6}px`;
    const p = pop.getBoundingClientRect();
    if (p.right > window.innerWidth - margin) {
      pop.style.left = `${Math.max(margin, window.innerWidth - margin - p.width)}px`;
    }
    if (p.bottom > window.innerHeight - margin) {
      pop.style.top = `${Math.max(margin, r.top - 6 - p.height)}px`;
    }
  }

  /**
   * Option gewählt.
   * @param {string} option
   * @returns {void}
   */
  _choose(option) {
    const entity = this.getAttribute('entity');
    const changedValue = option !== this.getAttribute('value');
    this.close();
    if (!entity || !changedValue) return;
    this.setAttribute('value', option); // optimistisch
    markPending(this);
    fire(this, 'np-call', selectCall(entity, option));
  }
}

/* ---------------------------------------------------------------------------
 *  <np-inline-toggle> – antippbares Wort, das direkt umschaltet
 *  Attribute: entity, state ("on"|"off"), on-label, off-label, disabled, flash
 * ------------------------------------------------------------------------- */

class NpInlineToggle extends HTMLElement {
  static get observedAttributes() {
    return ['state', 'on-label', 'off-label', 'disabled'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('click', () => this._onClick());
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  /** @returns {void} */
  _render() {
    const on = this.getAttribute('state') === 'on';
    const label = on ? (this.getAttribute('on-label') ?? 'an') : (this.getAttribute('off-label') ?? 'aus');
    // Ohne Zeilenumbruch nach <style> – sonst Leerzeichen im Fließtext.
    this.shadowRoot.innerHTML = `<style>${INLINE_CSS}</style>`
      + `<button type="button" class="word" role="switch" aria-checked="${on}"`
      + ` ${this.hasAttribute('disabled') ? 'disabled' : ''}>${esc(label)}</button>`;
  }

  /** @returns {void} */
  _onClick() {
    const entity = this.getAttribute('entity');
    if (!entity || this.hasAttribute('disabled') || this.hasAttribute('pending')) return;
    this.setAttribute('state', this.getAttribute('state') === 'on' ? 'off' : 'on');
    markPending(this);
    fire(this, 'np-call', toggleCall(entity));
  }
}

/* ---------------------------------------------------------------------------
 *  Registrierung
 * ------------------------------------------------------------------------- */

/**
 * Registriert alle Komponenten (mehrfacher Aufruf ist unschädlich).
 *
 * @returns {void}
 * @example defineControls();
 */
export function defineControls() {
  const defs = {
    'np-toggle': NpToggle,
    'np-choice': NpChoice,
    'np-inline-select': NpInlineSelect,
    'np-inline-toggle': NpInlineToggle,
  };
  for (const [name, cls] of Object.entries(defs)) {
    if (!customElements.get(name)) customElements.define(name, cls);
  }
}

/* ---------------------------------------------------------------------------
 *  HTML-Erzeuger für Rubriken (über ctx.ui erreichbar)
 * ------------------------------------------------------------------------- */

/**
 * Baut die Optionsliste aus `attributes.options` einer select-Entität und
 * übersetzt die Rohwerte über ein Mapping. Unbekannte Werte behalten ihren
 * Rohnamen – so führt ein neuer evcc-Modus nie zu einem Fehler.
 *
 * @param {object|null} stateObj  State-Objekt der select-Entität
 * @param {object} [labels={}]    Mapping Rohwert → Anzeigename
 * @returns {Array<{value: string, label: string}>}
 * @example optionsFrom(hass.states['select.evcc_mode'], { now: 'Schnell' })
 *          // → [{value:'off',label:'off'}, {value:'now',label:'Schnell'}, …]
 */
export function optionsFrom(stateObj, labels = {}) {
  const raw = stateObj?.attributes?.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => ({ value: String(value), label: labels?.[value] ?? String(value) }));
}

/**
 * Anzeigename einer Option (mit Fallback auf den Rohwert).
 *
 * @param {string} value
 * @param {object} [labels={}]
 * @returns {string}
 * @example labelFor('smart', { smart: 'Smart' }) // → "Smart"
 */
export function labelFor(value, labels = {}) {
  return labels?.[value] ?? String(value ?? '–');
}

/**
 * Baut eine Attributliste; leere/false-Werte entfallen, true → nur Name.
 *
 * @param {object} attrs
 * @returns {string}
 */
function attrs(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
    .join(' ');
}

/**
 * Klassischer Kippschalter.
 *
 * @param {object} o
 * @param {string} o.entity     Entity-ID
 * @param {boolean} o.on        Aktueller Zustand
 * @param {string} o.label      Beschriftung
 * @param {string} [o.note]     Text statt „an/aus“ (z. B. „nicht verfügbar“)
 * @param {boolean} [o.disabled]
 * @param {boolean} [o.flash]   Kurzes Aufleuchten (nach dem Schalten)
 * @returns {string} HTML
 * @example toggle({ entity: 'light.flur', on: true, label: 'Flur' })
 */
export function toggle({ entity, on, label, note, disabled, flash }) {
  return `<np-toggle ${attrs({ entity, state: on ? 'on' : 'off', label, note, disabled, flash })}></np-toggle>`;
}

/**
 * Segment-Auswahl.
 *
 * @param {object} o
 * @param {string} o.entity
 * @param {string} o.value      Aktuelle Option (Rohwert)
 * @param {Array<{value: string, label: string}>} o.options
 * @param {boolean} [o.disabled]
 * @param {boolean} [o.flash]
 * @returns {string} HTML
 * @example choice({ entity: 'select.evcc_mode', value: 'pv', options })
 */
export function choice({ entity, value, options, disabled, flash }) {
  return `<np-choice ${attrs({ entity, value, options: JSON.stringify(options || []), disabled, flash })}></np-choice>`;
}

/**
 * Inline-Auswahl im Fließtext.
 *
 * @param {object} o
 * @param {string} o.entity
 * @param {string} o.value
 * @param {Array<{value: string, label: string}>} o.options
 * @param {string} [o.title]    Überschrift in der Liste, z. B. „Lademodus“
 * @param {boolean} [o.disabled]
 * @param {boolean} [o.flash]
 * @returns {string} HTML
 * @example `im Modus ›${inlineSelect({ entity, value: 'smart', options })}‹`
 */
export function inlineSelect({ entity, value, options, title, disabled, flash }) {
  return `<np-inline-select ${attrs({ entity, value, options: JSON.stringify(options || []), 'title-text': title, disabled, flash })}></np-inline-select>`;
}

/**
 * Inline-Umschalter im Fließtext.
 *
 * @param {object} o
 * @param {string} o.entity
 * @param {boolean} o.on
 * @param {string} [o.onLabel='an']
 * @param {string} [o.offLabel='aus']
 * @param {boolean} [o.disabled]
 * @param {boolean} [o.flash]
 * @returns {string} HTML
 * @example `Das Flurlicht ist ${inlineToggle({ entity: 'light.flur', on: true })}.`
 */
export function inlineToggle({ entity, on, onLabel, offLabel, disabled, flash }) {
  return `<np-inline-toggle ${attrs({ entity, state: on ? 'on' : 'off', 'on-label': onLabel, 'off-label': offLabel, disabled, flash })}></np-inline-toggle>`;
}
