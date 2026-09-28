# Die Hauszeitung – Home-Assistant-Panel im Newspaper-Stil

Ein eigenes Seitenleisten-Panel für Home Assistant. Es zeigt die Hausdaten
überwiegend als redaktionellen Fließtext im Stil einer modernen Tageszeitung.
Die wichtigsten Werte und Schalter gibt es zusätzlich klassisch: als
Faktenboxen, Kippschalter und antippbare Wörter im Text. Gedacht für ein
Wandtablet im Querformat.

- **Aufmacher nach Wichtigkeit:** Jede Rubrik meldet selbst ihre Priorität.
  Am Vorabend der Abfuhr steht deshalb groß „Morgen kommt die Biotonne“ oben,
  bei vollem Akku „Auto voll geladen“.
- **Textbausteine:** Alle Texte stehen in `config.js`, mit Platzhaltern,
  mehreren Formulierungen pro Situation, Singular/Plural und Artikeln.
- **Schalter klassisch und inline:** Im Text „lädt im Modus ›Smart‹“ öffnet
  das Antippen von „Smart“ eine Auswahl der Lademodi.
- **Tag/Nacht:** Das Farbschema folgt automatisch `sun.sun`; nachts ist die
  Darstellung gedämpft und blendfrei.
- **Offline-fähig:** Kein Build-Schritt, kein npm, keine CDNs, nur
  Systemschriften.

---

## Inhalt

1. [Dateien](#dateien)
2. [Installation](#installation)
3. [Entitäten eintragen](#entitäten-eintragen)
4. [Textbausteine ändern](#textbausteine-ändern)
5. [Schalter hinzufügen](#schalter-hinzufügen)
6. [Neue Rubrik hinzufügen](#neue-rubrik-hinzufügen)
7. [Design anpassen](#design-anpassen)
8. [Kiosk-Betrieb auf dem Wandtablet](#kiosk-betrieb-auf-dem-wandtablet)
9. [Fehlersuche](#fehlersuche)

---

## Dateien

```
newspaper/                    → kommt nach /config/www/newspaper/
├── newspaper-panel.js        Hauptkomponente: Layout, Rubrik-Registry, Neuzeichnen, Schalten
├── config.js                 ✏️ ALLE Einstellungen: Name, Entitäten, Schwellwerte, Texte, Reihenfolge
├── core/
│   ├── text-engine.js        Textbausteine: Platzhalter, Varianten, Plural, Artikel
│   ├── format.js             Deutsche Zahlen und Daten („7,2 kW“, „übermorgen“)
│   ├── entities.js           Sicherer Zugriff auf hass.states (unavailable → null)
│   ├── forecast.js           Wettervorhersage per weather/subscribe_forecast
│   ├── controls.js           <np-toggle>, <np-choice>, <np-inline-select>, <np-inline-toggle>
│   └── theme.js              Design-Tokens (CSS-Variablen) und komplettes Stylesheet
└── sections/
    ├── weather.js            Wetter & Raumklima
    ├── evcc.js               E-Auto laden (ha-evcc von marq24)
    ├── waste.js              Müllkalender (Waste Collection Schedule von mampfes)
    ├── switchboard.js        Schaltkasten (Randspalte)
    └── _vorlage.js           Kopiervorlage für neue Rubriken
```

Alle typischen Änderungsstellen sind mit `✏️ ANPASSEN` markiert; die Suche
nach diesem Marker führt direkt dorthin.

---

## Installation

### 1. Dateien kopieren

Kopiere den Ordner `newspaper/` nach `/config/www/newspaper/`, zum Beispiel
per Samba-Freigabe, mit dem File-Editor-Add-on oder per SSH:

```bash
scp -r newspaper/ root@homeassistant.local:/config/www/
```

> Existierte `/config/www/` vorher noch nicht, muss Home Assistant einmal
> neu gestartet werden, damit `/local/` bereitsteht.

### 2. Panel in `configuration.yaml` eintragen

```yaml
panel_custom:
  - name: newspaper-panel            # muss dem Elementnamen im Code entsprechen
    url_path: hauszeitung            # → http://homeassistant.local:8123/hauszeitung
    sidebar_title: Hauszeitung
    sidebar_icon: mdi:newspaper-variant-outline
    module_url: /local/newspaper/newspaper-panel.js?v=1
    require_admin: false
```

### 3. Home Assistant neu starten

Danach erscheint „Hauszeitung“ in der Seitenleiste. Solange in `config.js`
noch Platzhalter stehen, zeigen die Rubriken den Hinweis „Diese Rubrik ist
noch nicht eingerichtet“. Das ist so gewollt; abstürzen kann dabei nichts.

### Cache-Busting mit `?v=`

Browser und besonders Kiosk-Browser halten Dateien aus `/local/` hartnäckig
im Zwischenspeicher. **Nach jeder Änderung an einer Datei die Zahl erhöhen**
(`?v=1` → `?v=2`), dann Home Assistant neu starten oder die YAML neu laden
und das Tablet neu laden.

Der Zusatz wirkt für **alle** Dateien, nicht nur für die Hauptdatei:
`newspaper-panel.js` lädt `config.js`, `core/` und `sections/` selbst nach
und hängt dabei dieselbe Versionsangabe an. Das klappt nur, weil die Module
in `core/` und `sections/` selbst nichts importieren und alles über das
`ctx`-Objekt bekommen. Diese Regel bitte auch bei eigenen Rubriken einhalten.

---

## Entitäten eintragen

Suche in `config.js` nach **`PLATZHALTER`** und ersetze die IDs. Optionale
Einträge (in den Kommentaren markiert) dürfen leer bleiben (`''`); die
zugehörigen Sätze entfallen dann.

Zum Finden der IDs dieses Template unter **Entwicklerwerkzeuge → Template**
einfügen:

```jinja
WETTER: {{ states.weather | map(attribute='entity_id') | join(', ') }}
SONNE: {{ states('sun.sun') }}

EVCC:
{% for s in states
   | selectattr('domain','in',['select','sensor','binary_sensor','number'])
   | selectattr('entity_id','search','evcc_')
   | selectattr('entity_id','search','mode|charg|soc|power|pv|grid|batter|connect|plan|vehicle|always|green') %}{{ s.entity_id }}{% if s.attributes.options is defined %} {{ s.attributes.options }}{% endif %}
{% endfor %}
MÜLL:
{% for id in integration_entities('waste_collection_schedule') %}{{ id }} daysTo={{ state_attr(id,'daysTo') }}
{% endfor %}
```

### Wetter & Raumklima

- `entity`: die weather-Entität. Die Vorhersage kommt **nicht** aus
  Attributen, sondern über `weather/subscribe_forecast` (aktueller
  HA-Standard). Das Abo wird beim Verlassen des Panels beendet.
- `rooms`: je Raum `name`, `where` („im Bad“, „in der Küche“), `temperature`
  und optional `humidity`. Aus `where` wird automatisch „aus dem Bad“ für den
  Satz „Aus dem Bad liegen derzeit keine Messwerte vor.“ gebildet. Passt das
  nicht, `from: 'aus der Waschküche'` angeben.
- `thresholds`: Lüftungshinweis, Regen, Frost, Hitze, Wind.

### E-Auto laden (evcc)

- **Lademodi werden nie fest eingetragen.** Die Optionen kommen immer
  dynamisch aus `attributes.options` der Mode-Select-Entität. Ältere
  evcc-Versionen liefern `off | pv | minpv | now`, neuere `off | smart | now`.
  Deutsche Namen stehen in `EVCC_MODE_LABELS` oben in `config.js`; ein
  unbekannter neuer Modus erscheint mit seinem Rohnamen.
- `alwaysCharge` (neue evcc, `off | on | once`) wird nur angezeigt, wenn die
  Entität existiert.
- **Solaranteil:** Am genauesten ist `greenShare` (evcc
  „greenShareLoadpoints“). Ohne diesen Sensor wird aus Netz- und
  Batterieleistung genähert.
- **Vorzeichen:** evcc liefert Netzleistung positiv bei Bezug und
  Batterieleistung positiv beim Entladen. Wenn deine Sensoren es umgekehrt
  liefern, `gridImportPositive` bzw. `batteryDischargePositive` auf `false`
  setzen.

### Müllkalender (Waste Collection Schedule)

Gerechnet wird **ausschließlich** mit dem numerischen Attribut `daysTo`, nie
mit dem angezeigten State, denn der hängt vom `value_template` ab. Fehlt
`daysTo`, zeigt die Rubrik einen Hinweis. Nachrüsten per YAML:

```yaml
sensor:
  - platform: waste_collection_schedule
    name: Biotonne
    add_days_to: true          # ← liefert das Attribut daysTo
    types:
      - Biotonne               # Typname wie ihn deine Quelle liefert
  - platform: waste_collection_schedule
    name: Gelber Sack
    add_days_to: true
    types:
      - Gelber Sack
```

Ist Waste Collection Schedule über die Oberfläche eingerichtet, findet sich
die entsprechende Option („add days to“) in den Einstellungen des jeweiligen
Sensors der Integration.

Pro Tonne gibt es in `config.js` `name`, `genus` (`'m'`, `'f'`, `'n'`,
`'pl'`) und `color`. Für Namen mit Adjektiv lassen sich die fertigen Formen
angeben, damit die Sätze grammatisch stimmen:

```js
{ entity: 'sensor.gelber_sack', name: 'Gelber Sack', genus: 'm', color: '#e2b622',
  forms: { nom: 'der Gelbe Sack', akk: 'den Gelben Sack', dat: 'dem Gelben Sack' } },
```

---

## Textbausteine ändern

Jede Rubrik hat in `config.js` einen Block `texts`. Ein Baustein ist
entweder ein einzelner Text oder eine Liste von Varianten:

```js
tomorrow: [
  'Morgen {wird} {tonne} abgeholt – heute Abend rausstellen.',
  'Morgen früh {kommt} {tonne}; am besten schon heute Abend an die Straße stellen.',
],
```

Bei Varianten wird **pro Tag eine** gewählt. Der Text wechselt also nicht bei
jedem Update, klingt aber nicht jeden Tag gleich.

| Schreibweise   | Bedeutung                                   | Beispiel → Ergebnis                         |
|----------------|---------------------------------------------|---------------------------------------------|
| `{name}`       | Wert einsetzen                              | `{temp}` → „21,5 °C“                        |
| `{Name}`       | Wert mit großem Anfangsbuchstaben           | `{Tonne}` → „Die Biotonne“                  |
| `{n:Tag\|Tagen}` | Singular bei n = 1, sonst Plural          | `in {n} {n:Tag\|Tagen}` → „in 3 Tagen“       |
| `<em>…</em>`   | Einfaches HTML ist im Baustein erlaubt      |                                             |

Welche Platzhalter eine Rubrik anbietet, steht im Kommentar über ihrem
`texts`-Block. Ein falsch geschriebener Platzhalter bleibt sichtbar stehen,
z. B. „{tmep}“, und in der Browser-Konsole erscheint eine Warnung.

**Verben passend zur Anzahl:** Die Müll-Rubrik liefert `{wird}` (wird/werden),
`{kommt}` (kommt/kommen) usw. Daraus wird bei einer Tonne „Morgen wird die
Biotonne abgeholt“, bei zwei „Morgen werden die Biotonne und das Altpapier
abgeholt“.

**Schwellwerte und Prioritäten:** Schwellwerte stehen in `config.js`
(`thresholds`, `eveningFromHour` …). Ab welcher Priorität eine Rubrik zum
Aufmacher wird, steht jeweils oben in der Rubrik-Datei (`PRIORITY`,
`✏️ ANPASSEN`).

---

## Schalter hinzufügen

### Klassisch im Schaltkasten

In `config.js` im Eintrag `switchboard` unter `items` ergänzen:

```js
items: [
  { entity: 'light.kueche', label: 'Licht Küche' },
  { entity: 'switch.kaffeemaschine', label: 'Kaffeemaschine' },
  { entity: 'input_boolean.gaestemodus', label: 'Gästemodus' },
  // select/input_select erscheinen als Knopfreihe; labels übersetzt die Optionen:
  { entity: 'select.evcc_lp1_mode', label: 'Lademodus', labels: EVCC_MODE_LABELS },
],
```

`light`, `switch`, `input_boolean`, `fan` usw. werden als Kippschalter
gezeigt und über `homeassistant.toggle` geschaltet; `select` und
`input_select` über `select_option`. Nicht verfügbare Entitäten erscheinen
ausgegraut.

### Inline im Fließtext

In einer Rubrik stehen über `ctx.ui` zur Verfügung:

```js
// Antippbares Wort mit Auswahlliste
const modus = ctx.raw(ctx.ui.inlineSelect({
  entity: 'select.evcc_lp1_mode',
  value: stateObj.state,
  options: ctx.ui.optionsFrom(stateObj, cfg.modeLabels),
  title: 'Lademodus',
}));
ctx.say(cfg.texts, 'modeIdle', { modus });   // „Der Lademodus steht auf ›Smart‹.“

// Antippbares Wort, das direkt umschaltet
const licht = ctx.raw(ctx.ui.inlineToggle({ entity: 'light.flur', on: true, onLabel: 'an', offLabel: 'aus' }));
ctx.say(cfg.texts, 'flur', { licht });       // „Das Flurlicht ist ›an‹.“
```

Inline-Schalter haben eine gepunktete Unterstreichung und eine Trefferfläche
von mindestens 48 px. Nach dem Schalten pulsieren sie kurz, bis Home
Assistant den neuen Zustand meldet, und leuchten dann einmal auf. Am unteren
Bildschirmrand erscheint „Erledigt“ oder eine Fehlermeldung.

---

## Neue Rubrik hinzufügen

Eine neue Rubrik braucht **eine Datei** und **einen Eintrag in
`config.js`**. Das folgende Beispiel meldet den Status der Waschmaschine.

**Schritt 1:** `sections/_vorlage.js` nach `sections/waschmaschine.js`
kopieren.

**Schritt 2:** Kennung setzen und die Zustände auswerten:

```js
function analyse(hass, cfg, ctx) {
  const value = ctx.ent.state(hass, cfg.entity);   // null, wenn unavailable/fehlend
  let status = 'noData';
  if (value === 'running') status = 'running';
  else if (value === 'finished') status = 'done';
  return { status, value };
}

export default {
  id: 'waschmaschine',
  kicker: 'Waschküche',
  getWatchedEntities: (cfg) => [cfg.entity],
  getPriority: (hass, cfg, ctx) => (analyse(hass, cfg, ctx).status === 'done' ? 70 : 10),
  renderArticle(hass, cfg, ctx) {
    const a = analyse(hass, cfg, ctx);
    const key = a.status === 'noData' ? 'fallback' : a.status;
    return {
      headline: ctx.say(cfg.texts, `headlines.${key}`),
      html: `<p>${ctx.say(cfg.texts, a.status)}</p>`,
    };
  },
  renderFactbox: (hass, cfg, ctx) => null,   // keine Faktenbox
};
```

**Schritt 3:** Eintrag in `config.js` unter `sections` ergänzen. Die Position
in der Liste bestimmt die Reihenfolge im Blatt:

```js
{
  id: 'waschmaschine',
  module: './sections/waschmaschine.js',
  enabled: true,
  kicker: 'Waschküche',
  entity: 'sensor.waschmaschine_status',
  texts: {
    running: ['Die Waschmaschine läuft noch.'],
    done: ['Die Wäsche ist fertig und will aufgehängt werden.', 'Waschgang beendet – ab auf die Leine!'],
    noData: ['Aus der Waschküche liegen keine Daten vor.'],
    headlines: { running: 'Waschgang läuft', done: 'Wäsche ist fertig', fallback: 'Waschküche' },
  },
},
```

**Schritt 4:** In `configuration.yaml` `?v=` erhöhen und das Tablet neu
laden.

### Die Schnittstelle im Überblick

| Funktion | Pflicht | Aufgabe |
|---|---|---|
| `id`, `kicker` | ja | Kennung und Standard-Dachzeile (`kicker` in `config.js` hat Vorrang) |
| `getWatchedEntities(cfg)` | ja | Entitäten, deren Änderung ein Neuzeichnen auslöst |
| `getPriority(hass, cfg, ctx)` | ja | 0–100; die höchste wird Aufmacher (90+ dringend, 50–80 wichtig, 20–40 normal) |
| `renderArticle(hass, cfg, ctx, { lead })` | nein\* | `{ headline, html }` oder `null`; bei `lead: true` darf der Text ausführlicher sein |
| `renderFactbox(hass, cfg, ctx)` | nein\* | `{ title, html, placement? }` oder `null`; `placement: 'rail'` = rechte Randspalte |
| `getForecasts(cfg)` | nein | `[{ entity_id, type: 'daily' }]`, wenn die Rubrik eine Wettervorhersage braucht |

\* Mindestens eine der beiden Funktionen.

Was in `ctx` steckt, ist oben in `sections/_vorlage.js` beschrieben:
Formatierung (`ctx.fmt`), sicherer Zugriff (`ctx.ent`), Textbausteine
(`ctx.say`), Grammatik (`ctx.text.noun/list/agree`), Bedienelemente
(`ctx.ui`), Vorhersagen (`ctx.forecast`).

Wiederverwendbare CSS-Klassen für Faktenboxen: `np-table` (Tabelle),
`np-facts` (Beschriftung/Wert-Liste, als `<dl>`), `np-dates` (Terminliste mit
`<span class="dot" style="--dot:#hex">`), `muted`, `warn`, `ok`, `np-hint`.

**Robustheit:** Wirft eine Rubrik einen Fehler, erscheint an ihrer Stelle
ein Hinweis, und der Rest des Blatts wird trotzdem gedruckt. Die Details
stehen in der Browser-Konsole.

---

## Design anpassen

Alle Farben und Größen sind CSS-Variablen in `core/theme.js`:

- **Block 1:** Tag-Farben (Papierton), Schriften, Grundgröße
- **Block 2:** Nacht-Farben (gedämpft)
- **Block 5:** Spaltenbreiten

**Passt nicht alles auf den Schirm?** Zuerst `--np-size-base` verkleinern.

**Tag/Nacht fest einstellen:** In `config.js` unter `theme` `mode: 'light'`
oder `mode: 'dark'` setzen; Standard ist `'auto'` über `sun.sun`.

---

## Kiosk-Betrieb auf dem Wandtablet

- **Browser:** Bewährt ist der *Fully Kiosk Browser* (Android). Als
  Start-URL `http://homeassistant.local:8123/hauszeitung` eintragen.
  Empfehlenswert sind außerdem:
  - „Keep Screen On“
  - Bildschirm per Bewegungserkennung wecken
  - „Reload on Screen On“, damit nach Updates die neue Version geladen wird
- **Eigener HA-Benutzer** für das Tablet, ohne Admin-Rechte (das Panel hat
  `require_admin: false`). Im Profil dieses Benutzers die Seitenleiste
  ausblenden, dann füllt die Zeitung den ganzen Bildschirm.
- **Seitenleiste im schmalen Modus:** Auf schmalen Geräten zeigt der
  Zeitungskopf links einen ☰-Knopf, der die HA-Seitenleiste öffnet.
- **Nachts:** Der Nachtmodus ist bewusst kontrastarm. Zusätzlich lässt sich
  in Fully Kiosk die Bildschirmhelligkeit zeitgesteuert oder per
  HA-Automation (Fully-Kiosk-Integration) absenken.
- **Offline:** Das Panel lädt nichts aus dem Internet (keine CDNs,
  Systemschriften). Es braucht nur die Verbindung zu Home Assistant.
- **Nach Änderungen:** `?v=` erhöhen und in Fully Kiosk den Cache leeren
  bzw. neu laden.

---

## Fehlersuche

| Symptom | Ursache / Lösung |
|---|---|
| „Die Hauszeitung konnte nicht gedruckt werden“ mit Fehlertext | Meist ein Syntaxfehler in `config.js` (fehlendes Komma, Anführungszeichen). Details stehen in der Meldung und in der Browser-Konsole. |
| Änderungen erscheinen nicht | `?v=` erhöhen, Browser-Cache leeren. |
| „Diese Rubrik ist noch nicht eingerichtet“ | Es stehen noch `PLATZHALTER`-IDs in `config.js`. |
| „Rubrik … konnte nicht geladen werden“ | Pfad in `module:` falsch oder Syntaxfehler in der Rubrik-Datei. |
| „Für die Biotonne fehlt das Attribut daysTo“ | `add_days_to: true` am WCS-Sensor setzen (siehe oben). |
| Keine Wettervorhersage | Die weather-Integration liefert keine Tagesvorhersage; die Konsole zeigt eine Warnung zum Abo. |
| Sichtbarer Platzhalter wie „{tmep}“ im Text | Tippfehler im Textbaustein; die Konsole zeigt eine Warnung. |

Browser-Konsole: am PC mit F12; alle Meldungen beginnen mit `[Hauszeitung]`.
