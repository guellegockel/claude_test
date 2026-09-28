/**
 * ============================================================================
 *  core/theme.js – Design-Tokens und Stylesheet der Hauszeitung
 * ============================================================================
 *
 *  Zweck:
 *    Das komplette Aussehen des Panels: Farben (Tag/Nacht), Schriften,
 *    Abstände, Zeitungskopf, Spaltenlayout, Artikel, Faktenboxen, Meldungen.
 *    Alle Farben und Größen sind CSS Custom Properties (--np-…), damit sie
 *    an EINER Stelle geändert werden können und auch in den Schalter-
 *    Komponenten (core/controls.js) ankommen.
 *
 *  Gliederung des Stylesheets:
 *    1. Design-Tokens Tag     5. Raster, Artikel & Aufmacher
 *    2. Design-Tokens Nacht   6. „Kurz notiert“ & Faktenboxen
 *    3. Seite & Grundlagen    7. Meldungen (Toast)
 *    4. Zeitungskopf          8. Anpassung an andere Bildschirme
 *
 *  Abhängigkeiten:
 *    Keine. newspaper-panel.js setzt `styles` in sein Shadow DOM und das
 *    Attribut data-theme="light|dark" auf sich selbst.
 *
 *  Typische Anpassungen:
 *    - Farben: Blöcke 1 und 2 (✏️ ANPASSEN)
 *    - Schriftgrößen/Dichte, damit alles auf das Tablet passt: Block 1
 *    - Spaltenbreiten: Block 5 (.columns)
 * ============================================================================
 */

/**
 * Bestimmt das Farbschema.
 *
 * @param {'auto'|'light'|'dark'} mode  Einstellung aus config.js
 * @param {string|null} sunState        Zustand von sun.sun
 * @returns {'light'|'dark'}
 * @example resolveTheme('auto', 'below_horizon') // → "dark"
 */
export function resolveTheme(mode, sunState) {
  if (mode === 'light' || mode === 'dark') return mode;
  // Ohne sun.sun (null) bleibt es hell – lieber zu hell als unlesbar.
  return sunState === 'below_horizon' ? 'dark' : 'light';
}

export const styles = `
/* =====================================================================
   1. DESIGN-TOKENS – TAG (Zeitungspapier)
   ===================================================================== */
:host {
  /* Schriften: nur Systemschriften, damit das Tablet offline funktioniert. */
  --np-font-serif: Georgia, "Times New Roman", "Noto Serif", "DejaVu Serif", serif;
  --np-font-display: "Playfair Display", "Bodoni 72", Didot, Georgia, "Times New Roman", serif;
  --np-font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  /* ✏️ ANPASSEN: Größen – skalieren mit der Bildschirmbreite (vw).
     Passt nicht alles auf den Schirm, zuerst --np-size-base verkleinern. */
  --np-size-base: clamp(14px, 1.22vw, 21px);
  --np-size-title: clamp(34px, 4.8vw, 82px);
  --np-size-lead: clamp(26px, 3.1vw, 52px);
  --np-size-headline: clamp(18px, 1.7vw, 29px);
  --np-gap: clamp(12px, 1.7vw, 30px);
  --np-touch: 48px;           /* Mindestgröße für Touch-Ziele */
  --np-fade: 1.5s ease;       /* Dauer des Tag/Nacht-Übergangs */

  /* ✏️ ANPASSEN: Farben Tag */
  --np-paper: #f4efe4;        /* Papierton */
  --np-paper-2: #ebe3d2;      /* Faktenbox-Hintergrund */
  --np-ink: #1d1b18;          /* Druckerschwärze */
  --np-ink-soft: #5d564b;     /* Nebentext */
  --np-rule: #2b2722;         /* kräftige Linien */
  --np-rule-soft: #cbbfa8;    /* Spaltenlinien */
  --np-accent: #9e2016;       /* Kicker, Initiale, Inline-Schalter */
  --np-ok: #2e6b3b;
  --np-warn: #a2560a;
  --np-highlight: rgba(158, 32, 22, 0.16);
  --np-shadow: 0 8px 28px rgba(40, 28, 10, 0.22);

  display: block;
  height: 100%;
  color-scheme: light;
}

/* =====================================================================
   2. DESIGN-TOKENS – NACHT (gedämpft, blendfrei)
   Wenig Kontrast zwischen Text und Grund, kein reines Weiß: das Tablet
   soll nachts im dunklen Flur nicht leuchten wie eine Laterne.
   ===================================================================== */
:host([data-theme="dark"]) {
  /* ✏️ ANPASSEN: Farben Nacht */
  --np-paper: #131416;
  --np-paper-2: #1c1d20;
  --np-ink: #c4beb2;
  --np-ink-soft: #857f74;
  --np-rule: #5a554d;
  --np-rule-soft: #302e2b;
  --np-accent: #c0685d;
  --np-ok: #7fa886;
  --np-warn: #cf9a55;
  --np-highlight: rgba(192, 104, 93, 0.22);
  --np-shadow: 0 8px 28px rgba(0, 0, 0, 0.6);
  color-scheme: dark;
}

/* =====================================================================
   3. SEITE & GRUNDLAGEN
   ===================================================================== */
.page {
  box-sizing: border-box;
  height: 100vh;
  height: 100dvh;              /* berücksichtigt ein- und ausblendende Browserleisten */
  overflow-y: auto;            /* Notnagel: auf kleinen Schirmen darf gescrollt werden */
  display: flex;
  flex-direction: column;
  gap: calc(var(--np-gap) * 0.7);
  padding: calc(var(--np-gap) * 0.7) var(--np-gap) var(--np-gap);
  background: var(--np-paper);
  color: var(--np-ink);
  font-family: var(--np-font-serif);
  font-size: var(--np-size-base);
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  transition: background-color var(--np-fade), color var(--np-fade);
}
.page *, .page *::before, .page *::after {
  box-sizing: border-box;
  /* Sanfter Tag/Nacht-Übergang auch für Linien und Flächen */
  transition: border-color var(--np-fade), background-color var(--np-fade), color var(--np-fade);
}
.muted { color: var(--np-ink-soft); }
.warn { color: var(--np-warn); font-weight: 600; }
.ok { color: var(--np-ok); }
.np-hint { color: var(--np-ink-soft); font-style: italic; }
.np-nowrap { white-space: nowrap; }   /* hält ›Inline-Schalter‹ samt Zeichen zusammen */

/* =====================================================================
   4. ZEITUNGSKOPF
   Links: Datum/Ausgabe, Mitte: Titel, rechts: Mini-Wetter („Ohren“).
   ===================================================================== */
.masthead {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: var(--np-gap);
  padding-bottom: 0.45em;
  border-bottom: 3px double var(--np-rule);   /* dünne Doppellinie */
}
.ear {
  display: flex;
  flex-direction: column;
  gap: 0.15em;
  font-family: var(--np-font-sans);
  font-size: 0.78em;
  line-height: 1.35;
  color: var(--np-ink-soft);
  min-width: 0;
}
.ear strong { color: var(--np-ink); font-weight: 600; }
.ear-right { align-items: flex-end; text-align: right; }
.title-block { text-align: center; }
.title {
  margin: 0;
  font-family: var(--np-font-display);
  font-size: var(--np-size-title);
  font-weight: 800;
  line-height: 0.95;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.motto {
  margin: 0.35em 0 0;
  font-family: var(--np-font-sans);
  font-size: 0.68em;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--np-ink-soft);
}
.mini-weather {
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  color: var(--np-ink);
  font-size: 1.5em;
  font-variant-numeric: tabular-nums;
}
.mini-weather .symbol { font-size: 1.1em; }
.mini-range { font-variant-numeric: tabular-nums; }
.ear-left-row { display: flex; align-items: center; gap: 0.6em; }
.menu-btn {
  all: unset;
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--np-touch); height: var(--np-touch);
  margin-left: -0.6em;
  font-size: 1.6em;
  color: var(--np-ink);
  cursor: pointer;
}

/* =====================================================================
   5. RASTER, ARTIKEL & AUFMACHER
   ===================================================================== */
/* Raster mit benannten Bereichen:
     lead  = Aufmacher          more  = weitere Artikel
     notes = „Kurz notiert“     rail  = Randspalte (Schaltkasten)
   ✏️ ANPASSEN: Spaltenbreiten (Aufmacher | weitere Artikel | Randspalte) */
.columns {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 2.1fr) minmax(0, 1.3fr) minmax(0, 0.95fr);
  /* Artikel oben (dehnen sich), Faktenleiste unten. Werden die Artikel zu
     lang, wächst die Zeile und die Seite scrollt – statt zu überlappen. */
  grid-template-rows: 1fr auto;
  grid-template-areas:
    "lead  more  rail"
    "notes notes rail";
  column-gap: var(--np-gap);
}
.columns.no-more {
  grid-template-columns: minmax(0, 3.4fr) minmax(0, 0.95fr);
  grid-template-areas: "lead rail" "notes rail";
}
.columns.no-rail {
  grid-template-columns: minmax(0, 2.1fr) minmax(0, 1.3fr);
  grid-template-areas: "lead more" "notes notes";
}
.columns.no-more.no-rail {
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "lead" "notes";
}
.col-lead { grid-area: lead; min-width: 0; }
.col-more { grid-area: more; min-width: 0; }
.notes    { grid-area: notes; min-width: 0; }
.col-rail { grid-area: rail; min-width: 0; }
/* Spaltenlinien: mittig im Spaltenabstand */
.col-more, .col-rail {
  position: relative;
}
.col-more::before, .col-rail::before {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  left: calc(var(--np-gap) / -2);
  border-left: 1px solid var(--np-rule-soft);
}

.kicker {                                   /* Dachzeile */
  margin: 0 0 0.35em;
  font-family: var(--np-font-sans);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--np-accent);
}
.headline {
  margin: 0 0 0.45em;
  font-family: var(--np-font-display);
  font-size: var(--np-size-headline);
  font-weight: 700;
  line-height: 1.12;
}
.body p {
  margin: 0 0 0.7em;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.body p:last-child { margin-bottom: 0; }

/* Aufmacher: große Schlagzeile, zweispaltiger Text, Initiale */
.lead .headline {
  font-size: var(--np-size-lead);
  line-height: 1.04;
  letter-spacing: -0.01em;
  margin-bottom: 0.5em;
}
.lead .body {
  columns: 2;
  column-gap: var(--np-gap);
  column-rule: 1px solid var(--np-rule-soft);
  font-size: 1.06em;
}
.lead .body > p:first-child:not(.np-hint)::first-letter {   /* Initiale (Drop Cap) */
  float: left;
  margin: 0.05em 0.08em 0 0;
  font-family: var(--np-font-display);
  font-size: 3.4em;
  line-height: 0.82;
  font-weight: 700;
  color: var(--np-accent);
}
.col-more .article + .article {
  margin-top: 0.9em;
  padding-top: 0.9em;
  border-top: 1px solid var(--np-rule-soft);
}

/* =====================================================================
   6. LEISTE „KURZ NOTIERT“, RANDSPALTE & FAKTENBOXEN
   Grotesk-Schrift und Tabellenziffern für Kennzahlen.
   ===================================================================== */
.notes {
  margin-top: 0.6em;
  padding-top: 0.5em;
  border-top: 2px solid var(--np-rule);
}
.notes-title {
  margin: 0 0 0.5em;
  font-family: var(--np-font-sans);
  font-size: 0.72em;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
/* Faktenboxen nebeneinander; so viele Spalten, wie Platz ist */
.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15em, 1fr));
  gap: calc(var(--np-gap) * 0.7);
  align-items: start;
}
.notes .factbox {
  margin: 0;
  padding: 0.55em 0.75em 0.65em;
  background: var(--np-paper-2);
  border-top: 3px solid var(--np-ink);
}
.factbox {
  margin-bottom: 1.1em;
  font-family: var(--np-font-sans);
  font-size: 0.8em;
  line-height: 1.3;
}
.factbox-title {
  margin: 0 0 0.3em;
  font-size: 0.78em;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--np-accent);
}
/* Tabelle, z. B. Raum | Temp | Feuchte */
.np-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.np-table th, .np-table td {
  padding: 0.24em 0.2em;
  border-bottom: 1px solid var(--np-rule-soft);
  text-align: right;
  font-weight: 400;
}
.np-table th:first-child { text-align: left; }
.np-table thead th {
  font-size: 0.78em;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--np-ink-soft);
  border-bottom: 1px solid var(--np-rule);
}
.np-table tr.outdoor th, .np-table tr.outdoor td { font-weight: 600; }
/* Kennzahlen-Liste (Beschriftung links, Wert rechts) */
.np-facts { margin: 0; display: grid; grid-template-columns: auto 1fr; }
.np-facts dt, .np-facts dd {
  margin: 0;
  padding: 0.24em 0;
  border-bottom: 1px solid var(--np-rule-soft);
}
.np-facts dt { color: var(--np-ink-soft); padding-right: 0.8em; }
.np-facts dd { text-align: right; font-variant-numeric: tabular-nums; }
.np-big { font-size: 1.6em; font-weight: 700; line-height: 1.1; }
.np-control { margin-top: 0.5em; }
.np-control-label {
  margin: 0.6em 0 0.25em;
  font-size: 0.78em;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--np-ink-soft);
}
/* Terminliste mit Farbpunkt, z. B. Müllkalender */
.np-dates { list-style: none; margin: 0; padding: 0; }
.np-dates li {
  display: flex;
  align-items: center;
  gap: 0.6em;
  padding: 0.3em 0;
  border-bottom: 1px solid var(--np-rule-soft);
}
.np-dates .when { margin-left: auto; color: var(--np-ink-soft); font-variant-numeric: tabular-nums; }
.np-dates .soon .when { color: var(--np-accent); font-weight: 700; }
.dot {
  flex: none;
  width: 0.85em; height: 0.85em;
  border-radius: 50%;
  background: var(--dot, var(--np-ink-soft));
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}
.np-error { color: var(--np-warn); }

/* =====================================================================
   7. MELDUNGEN (TOAST)
   ===================================================================== */
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translate(-50%, 150%);
  padding: 0.7em 1.3em;
  background: var(--np-ink);
  color: var(--np-paper);
  font-family: var(--np-font-sans);
  font-size: 15px;
  border-radius: 3px;
  box-shadow: var(--np-shadow);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.3s ease, opacity 0.3s ease;
  z-index: 40;
}
.toast.show { transform: translate(-50%, 0); opacity: 1; }
.toast.ok::before { content: '✓ '; }
.toast.error { background: var(--np-warn); }
/* =====================================================================
   8. ANPASSUNG AN ANDERE BILDSCHIRME
   Hochformat/schmale Geräte: eine Spalte, Scrollen erlaubt.
   ===================================================================== */
@media (max-width: 900px), (orientation: portrait) {
  .columns, .columns.no-more, .columns.no-rail {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-template-areas: "lead" "more" "notes" "rail";
  }
  .col-more::before, .col-rail::before { display: none; }
  .col-more, .col-rail { margin-top: 1em; padding-top: 1em; border-top: 1px solid var(--np-rule-soft); }
  .lead .body { columns: 1; }
  .masthead { grid-template-columns: 1fr; text-align: center; }
  .ear, .ear-right { align-items: center; text-align: center; }
  .title { white-space: normal; }
}
@media (prefers-reduced-motion: reduce) {
  .page, .page * { transition: none !important; animation: none !important; }
}
`;

