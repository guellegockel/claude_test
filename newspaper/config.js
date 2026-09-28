/**
 * ============================================================================
 *  config.js – ALLE Einstellungen der Hauszeitung an einer Stelle
 * ============================================================================
 *
 *  Zweck:
 *    Zeitungsname, Entity-IDs, Schwellwerte, Textbausteine, Reihenfolge der
 *    Rubriken, Schalterliste und Anzeigenamen. Code muss für normale
 *    Anpassungen nicht angefasst werden.
 *
 *  Abhängigkeiten:
 *    Keine (reine Daten). Wird von newspaper-panel.js geladen.
 *
 *  Typische Anpassungen:
 *    - Suche nach „PLATZHALTER“: alle noch einzutragenden Entity-IDs.
 *      Solange eine ID ein PLATZHALTER ist, zeigt die Rubrik einen Hinweis
 *      statt Daten – es stürzt nichts ab.
 *    - Suche nach „✏️ ANPASSEN“: alle typischen Änderungsstellen.
 *    - Textbausteine: jeweils unter `texts` einer Rubrik. Ein Baustein ist
 *      ein String oder eine Liste von Varianten (pro Tag wird eine gewählt).
 *      Platzhalter: {name}; {Name} = mit großem Anfangsbuchstaben;
 *      {n:Tag|Tagen} = Singular/Plural je nach Zahl n. Details: README.
 *
 *  WICHTIG nach Änderungen: In configuration.yaml die Versionsnummer im
 *  module_url erhöhen (…/newspaper-panel.js?v=2) und das Tablet neu laden –
 *  sonst zeigt der Browser womöglich noch die alte Datei aus dem Cache.
 *
 *  Syntax-Tipp: Das hier ist JavaScript. Strings in '…', Einträge mit Komma
 *  trennen. Ein vergessenes Komma zeigt das Panel als Fehlermeldung an.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Gemeinsame Mappings (werden unten mehrfach verwendet)
// ---------------------------------------------------------------------------

// ✏️ ANPASSEN: Deutsche Anzeigenamen der evcc-Lademodi.
// Alte evcc-Versionen: off | pv | minpv | now
// Neue evcc-Versionen: off | smart | now  (+ separates Select „alwaysCharge“)
// Unbekannte Modi erscheinen einfach mit ihrem Rohnamen – kein Fehler.
const EVCC_MODE_LABELS = {
  off: 'Aus',
  pv: 'PV',
  minpv: 'Min+PV',
  now: 'Schnell',
  smart: 'Smart',
};

// ✏️ ANPASSEN: Anzeigenamen für das evcc-Select „alwaysCharge“ (nur neue evcc).
const EVCC_ALWAYS_CHARGE_LABELS = {
  off: 'Aus',
  on: 'Immer',
  once: 'Einmalig',
};

export default {
  // -------------------------------------------------------------------------
  // Zeitungskopf
  // -------------------------------------------------------------------------
  // ✏️ ANPASSEN: Name und Motto der Zeitung
  title: 'Die Hauszeitung',
  motto: 'Unabhängig · Überparteilich · Gut geheizt',
  // Gründungsjahr für „1. Jahrgang“ – null blendet den Jahrgang aus.
  foundedYear: 2026,

  header: {
    // ✏️ ANPASSEN: Wetter-Entität für das Mini-Wetter im Kopf
    weatherEntity: 'weather.PLATZHALTER_zuhause',
  },

  // -------------------------------------------------------------------------
  // Tag/Nacht-Darstellung
  // -------------------------------------------------------------------------
  theme: {
    // ✏️ ANPASSEN: 'auto' (über sun.sun), 'light' (immer hell), 'dark' (immer dunkel)
    mode: 'auto',
    sunEntity: 'sun.sun',
  },

  // -------------------------------------------------------------------------
  // Wetterzustände von Home Assistant → deutsche Wörter und Symbole.
  // Werden vom Zeitungskopf und der Wetter-Rubrik genutzt.
  // `label` passt in „Draußen herrscht derzeit {label} bei 14 °C.“
  // -------------------------------------------------------------------------
  // ✏️ ANPASSEN: Wetterbegriffe und Symbole
  weatherConditions: {
    'clear-night': { label: 'klarer Himmel', symbol: '☾' },
    cloudy: { label: 'dichte Bewölkung', symbol: '☁' },
    exceptional: { label: 'Ausnahmewetter', symbol: '⚠' },
    fog: { label: 'Nebel', symbol: '≋' },
    hail: { label: 'Hagel', symbol: '☄' },
    lightning: { label: 'Gewitter', symbol: 'ϟ' },
    'lightning-rainy': { label: 'Gewitter mit Regen', symbol: 'ϟ' },
    partlycloudy: { label: 'wechselnde Bewölkung', symbol: '⛅' },
    pouring: { label: 'Starkregen', symbol: '☔' },
    rainy: { label: 'Regen', symbol: '☂' },
    snowy: { label: 'Schneefall', symbol: '❄' },
    'snowy-rainy': { label: 'Schneeregen', symbol: '❄' },
    sunny: { label: 'Sonnenschein', symbol: '☀' },
    windy: { label: 'kräftiger Wind', symbol: '≈' },
    'windy-variant': { label: 'Wind und Wolken', symbol: '≈' },
  },

  // -------------------------------------------------------------------------
  // Allgemeine Texte des Panels
  // -------------------------------------------------------------------------
  texts: {
    edition: 'Ausgabe Nr. {nr}',
    volume: '{n}. Jahrgang',
    updated: 'Stand {zeit}',
    notesTitle: 'Kurz notiert',
    notConfigured: 'Diese Rubrik ist noch nicht eingerichtet: Bitte die Entitäten in config.js eintragen (Suche nach „PLATZHALTER“).',
    sectionError: 'Diese Rubrik konnte nicht gesetzt werden – Details in der Browser-Konsole.',
    loadError: 'Rubrik „{id}“ konnte nicht geladen werden: {msg}',
    toastPending: 'Wird geschaltet …',
    toastOk: 'Erledigt',
    toastError: 'Schalten fehlgeschlagen: {msg}',
  },

  // =========================================================================
  // RUBRIKEN
  // Reihenfolge hier = Reihenfolge im Blatt (der Aufmacher wird nach
  // Priorität gewählt und steht immer vorn). Eine Rubrik abschalten:
  // enabled: false. Neue Rubrik: Datei in sections/ anlegen + Eintrag hier.
  // Jeder Eintrag braucht `id` und `module`; alles andere liest die Rubrik.
  // =========================================================================
  // ✏️ ANPASSEN: Reihenfolge und Auswahl der Rubriken
  sections: [
    // -----------------------------------------------------------------------
    // Müllkalender (Integration „Waste Collection Schedule“ von mampfes)
    // -----------------------------------------------------------------------
    {
      id: 'waste',
      module: './sections/waste.js',
      enabled: true,
      kicker: 'Müllabfuhr',
      // ✏️ ANPASSEN: Ab dieser Stunde wird „morgen Abholung“ zum Aufmacher.
      eveningFromHour: 14,
      // ✏️ ANPASSEN: Bis zu dieser Stunde ist „heute Abholung“ hoch priorisiert.
      morningUntilHour: 12,
      // Termine bis zu so vielen Tagen im Voraus in der Faktenbox zeigen.
      listDays: 21,
      // ✏️ ANPASSEN: Je Tonnenart ein WCS-Sensor mit `add_days_to: true`.
      //   name  – Wort ohne Artikel
      //   genus – 'm' (der), 'f' (die), 'n' (das), 'pl' (die, Mehrzahl)
      //   forms – optional: fertige Formen, wenn ein Adjektiv mitdekliniert
      //           werden muss („der Gelbe Sack“ → „den Gelben Sack“)
      //   color – Farbe des Punkts in der Terminliste
      bins: [
        { entity: 'sensor.PLATZHALTER_biotonne', name: 'Biotonne', genus: 'f', color: '#7b5534' },
        { entity: 'sensor.PLATZHALTER_papiertonne', name: 'Altpapier', genus: 'n', color: '#2f5fa7' },
        {
          entity: 'sensor.PLATZHALTER_gelber_sack',
          name: 'Gelber Sack',
          genus: 'm',
          forms: { nom: 'der Gelbe Sack', akk: 'den Gelben Sack', dat: 'dem Gelben Sack' },
          color: '#e2b622',
        },
        { entity: 'sensor.PLATZHALTER_restmuell', name: 'Restmüll', genus: 'm', color: '#5b5b5b' },
      ],
      // ✏️ ANPASSEN: Textbausteine Müll.
      // Platzhalter: {tonne} (z. B. „die Biotonne“ oder „die Biotonne und das
      // Altpapier“), {wann} („morgen“, „am Dienstag“), Verben passend zur
      // Anzahl: {wird} wird/werden, {kommt} kommt/kommen, {war} war/waren,
      // {folgt} folgt/folgen.
      texts: {
        today: [
          'Heute {wird} {tonne} abgeholt – falls noch nicht geschehen, jetzt rausstellen.',
          'Abfuhrtag: Heute {wird} {tonne} geleert. Wer noch nicht rausgestellt hat, sollte sich beeilen.',
        ],
        todayLate: ['Heute {war} {tonne} an der Reihe.'],
        tomorrow: [
          'Morgen {wird} {tonne} abgeholt – heute Abend rausstellen.',
          'Morgen früh {kommt} {tonne}; am besten schon heute Abend an die Straße stellen.',
        ],
        next: ['Als Nächstes {wird} {wann} {tonne} abgeholt.'],
        noneThisWeek: ['Diese Woche keine Abholung; als Nächstes {kommt} {wann} {tonne}.'],
        after: ['Danach {folgt} {wann} {tonne}.'],
        none: ['Im Abfuhrkalender stehen derzeit keine Termine.'],
        noData: ['Vom Abfuhrkalender liegen derzeit keine Daten vor.'],
        missingDaysTo: ['Für {tonne} fehlt das Attribut „daysTo“ – bitte in der Waste-Collection-Konfiguration „add_days_to: true“ setzen (siehe README).'],
        headlines: {
          today: 'Heute {kommt} {tonne}',
          tomorrow: 'Morgen {kommt} {tonne}',
          next: '{Tonne} {kommt} {wann}',
          none: 'Ruhe an der Tonnenfront',
          fallback: 'Abfuhrkalender',
        },
        factboxTitle: 'Abfuhrtermine',
        factboxEmpty: 'Keine Termine',
        factboxNoData: 'keine Daten',
      },
    },

    // -----------------------------------------------------------------------
    // E-Auto laden (evcc, Integration „ha-evcc“ von marq24)
    // -----------------------------------------------------------------------
    {
      id: 'evcc',
      module: './sections/evcc.js',
      enabled: true,
      kicker: 'E-Auto laden',
      // ✏️ ANPASSEN: Wie heißt das Auto im Text? name ohne Artikel, genus m/f/n.
      // „das Auto“ → „Das Auto ist zu 64 % geladen …“, Schlagzeile „Auto voll geladen“.
      vehicle: { name: 'Auto', genus: 'n' },
      // Ab diesem Ladestand gilt der Wagen als „voll“.
      fullSoc: 100,
      // ✏️ ANPASSEN: Lademodus-Knöpfe zusätzlich in der Wallbox-Faktenbox zeigen?
      // Standard false, weil der Lademodus schon im Schaltkasten und antippbar
      // im Text steht – spart Platz auf dem Bildschirm.
      factboxControls: false,
      // evcc-Konvention: Netzleistung positiv = Bezug, Batterieleistung positiv = Entladen.
      // ✏️ ANPASSEN: Auf false setzen, falls deine Sensoren es umgekehrt liefern.
      gridImportPositive: true,
      batteryDischargePositive: true,
      // ✏️ ANPASSEN: Entitäten der evcc-Integration. Optionale Einträge dürfen
      // fehlen oder leer ('') sein – die zugehörigen Sätze entfallen dann.
      entities: {
        mode: 'select.PLATZHALTER_evcc_lp1_mode',                  // Lademodus (Pflicht)
        alwaysCharge: 'select.PLATZHALTER_evcc_lp1_always_charge',   // optional, nur neue evcc
        connected: 'binary_sensor.PLATZHALTER_evcc_lp1_connected',   // Fahrzeug angesteckt
        charging: 'binary_sensor.PLATZHALTER_evcc_lp1_charging',     // lädt gerade
        vehicleSoc: 'sensor.PLATZHALTER_evcc_lp1_vehicle_soc',       // Ladestand %
        limitSoc: 'number.PLATZHALTER_evcc_lp1_limit_soc',           // optional: Ladeziel %
        chargePower: 'sensor.PLATZHALTER_evcc_lp1_charge_power',     // Ladeleistung
        pvPower: 'sensor.PLATZHALTER_evcc_pv_power',                 // PV-Erzeugung
        gridPower: 'sensor.PLATZHALTER_evcc_grid_power',             // Netz (+Bezug/−Einspeisung)
        greenShare: 'sensor.PLATZHALTER_evcc_green_share_loadpoints', // optional: Solaranteil Laden
        batterySoc: 'sensor.PLATZHALTER_evcc_battery_soc',           // optional: Hausbatterie %
        batteryPower: 'sensor.PLATZHALTER_evcc_battery_power',       // optional: Hausbatterie W
        planTime: 'sensor.PLATZHALTER_evcc_lp1_effective_plan_time', // optional: Zielzeit Ladeplan
        vehicleName: 'sensor.PLATZHALTER_evcc_lp1_vehicle_name',     // optional: Fahrzeugname
      },
      modeLabels: EVCC_MODE_LABELS,
      alwaysChargeLabels: EVCC_ALWAYS_CHARGE_LABELS,
      // ✏️ ANPASSEN: Textbausteine evcc.
      // Platzhalter: {wagen} („das Auto“), {name} („Auto“), {soc}, {leistung},
      // {anteil} (Solaranteil-Satzteil), {modus} (antippbarer Lademodus),
      // {limit}, {zeit}, {wert}, {pv}, {netz}, {akku}
      texts: {
        noData: ['Von der Wallbox liegen derzeit keine Daten vor.'],
        unknown: ['Ob {wagen} an der Wallbox steht, ist gerade nicht bekannt.'],
        notConnected: [
          '{Wagen} steht nicht an der Wallbox.',
          '{Wagen} ist gerade unterwegs – jedenfalls nicht an der Wallbox angeschlossen.',
        ],
        charging: ['{Wagen} ist zu {soc} geladen und bezieht gerade {leistung}{anteil}.'],
        chargingNoSoc: ['{Wagen} lädt gerade mit {leistung}{anteil}.'],
        share: ', davon {share} aus der eigenen Solaranlage',
        full: ['{Wagen} ist voll geladen ({soc}) und startklar.'],
        limitReached: ['{Wagen} hat das Ladeziel von {limit} erreicht und ist startklar.'],
        offButConnected: ['{Wagen} hängt an der Wallbox, doch der Lademodus steht auf ›{modus}‹ – es wird nicht geladen.'],
        waiting: ['{Wagen} ist angeschlossen und zu {soc} geladen; gerade fließt kein Strom.'],
        waitingNoSoc: ['{Wagen} ist angeschlossen; gerade fließt kein Strom.'],
        modeCharging: ['Geladen wird im Modus ›{modus}‹.', 'Der Lademodus steht dabei auf ›{modus}‹.'],
        modeIdle: ['Der Lademodus steht auf ›{modus}‹.'],
        alwaysCharge: ['„Immer laden“ steht auf ›{wert}‹.'],
        plan: ['Laut Ladeplan soll {wagen} bis {zeit} fertig sein.'],
        pv: ['Die Solaranlage liefert gerade {pv}{netz}.'],
        gridExport: ', {netz} fließen ins Netz',
        gridImport: ', aus dem Netz kommen {netz}',
        battery: ['Die Hausbatterie ist zu {akku} gefüllt.'],
        headlines: {
          full: '{Name} voll geladen',
          limitReached: 'Ladeziel erreicht',
          offButConnected: '{Name} wartet auf Freigabe',
          chargingSolar: 'Sonnenstrom für {wagen}',
          charging: '{Name} lädt mit {leistung}',
          waiting: '{Name} an der Wallbox',
          notConnected: 'Wallbox frei',
          fallback: 'Die Wallbox',
        },
        factboxTitle: 'Wallbox',
        labels: {
          vehicle: 'Fahrzeug',
          connected: 'angeschlossen',
          notConnected: 'nicht da',
          soc: 'Ladestand',
          power: 'Ladeleistung',
          share: 'Solaranteil',
          pv: 'PV-Erzeugung',
          grid: 'Netz',
          gridImport: 'Bezug',
          gridExport: 'Einspeisung',
          battery: 'Hausbatterie',
          plan: 'Ladeplan',
          mode: 'Lademodus',
          alwaysCharge: 'Immer laden',
        },
      },
    },

    // -----------------------------------------------------------------------
    // Wetter & Raumklima
    // -----------------------------------------------------------------------
    {
      id: 'weather',
      module: './sections/weather.js',
      enabled: true,
      kicker: 'Wetter & Raumklima',
      // ✏️ ANPASSEN: Wetter-Entität (Vorhersage kommt per weather/subscribe_forecast)
      entity: 'weather.PLATZHALTER_zuhause',
      // Ab dieser Stunde schaut der Vorhersagetext auf morgen statt auf heute.
      tomorrowFromHour: 17,
      // ✏️ ANPASSEN: Räume. `where` wird im Satz verwendet („im Bad“, „in der Küche“).
      // Aus `where` wird automatisch „aus dem Bad“ gebildet; bei Bedarf mit
      // `from: 'aus der Waschküche'` selbst angeben. humidity darf fehlen.
      rooms: [
        { name: 'Wohnzimmer', where: 'im Wohnzimmer', temperature: 'sensor.PLATZHALTER_wohnzimmer_temperatur', humidity: 'sensor.PLATZHALTER_wohnzimmer_luftfeuchte' },
        { name: 'Küche', where: 'in der Küche', temperature: 'sensor.PLATZHALTER_kueche_temperatur', humidity: 'sensor.PLATZHALTER_kueche_luftfeuchte' },
        { name: 'Schlafzimmer', where: 'im Schlafzimmer', temperature: 'sensor.PLATZHALTER_schlafzimmer_temperatur', humidity: 'sensor.PLATZHALTER_schlafzimmer_luftfeuchte' },
        { name: 'Bad', where: 'im Bad', temperature: 'sensor.PLATZHALTER_bad_temperatur', humidity: 'sensor.PLATZHALTER_bad_luftfeuchte' },
        { name: 'Keller', where: 'im Keller', temperature: 'sensor.PLATZHALTER_keller_temperatur', humidity: 'sensor.PLATZHALTER_keller_luftfeuchte' },
      ],
      // ✏️ ANPASSEN: Schwellwerte
      thresholds: {
        ventilateHumidity: 65, // % – ab hier Lüftungshinweis
        rainProbability: 50,   // % – ab hier gilt der Tag als regnerisch
        rainAmount: 1,         // mm – ab hier gilt der Tag als regnerisch
        frost: 0,              // °C – Tiefstwert ≤ Frost → Frostwarnung
        heat: 30,              // °C – Höchstwert ≥ Hitze → Hitzehinweis
        windStrong: 50,        // km/h – ab hier Windhinweis
        roomSpread: 1.5,       // °C – wärmster/kältester Raum erst ab diesem Unterschied erwähnen
      },
      // ✏️ ANPASSEN: Textbausteine Wetter.
      // Platzhalter: {zustand}, {temp}, {tag} („heute“/„morgen“), {max}, {min},
      // {chance} (Satzteil Regenwahrscheinlichkeit), {wind}, {liste}, {wo}, {h}, {von}
      texts: {
        current: [
          'Draußen herrscht derzeit {zustand} bei {temp}.',
          'Vor der Haustür: {zustand}, das Thermometer zeigt {temp}.',
        ],
        currentNoTemp: ['Draußen herrscht derzeit {zustand}.'],
        currentNoCondition: ['Draußen misst das Thermometer derzeit {temp}.'],
        noWeather: ['Vom Wetterdienst liegen derzeit keine Daten vor.'],
        noForecast: ['Eine Vorhersage liegt gerade nicht vor.'],
        dry: [
          '{Tag} bleibt es trocken, am Nachmittag bis {max}.',
          'Der Tag bleibt {tag} trocken, die Höchstwerte liegen bei {max}.',
        ],
        rain: [
          '{Tag} muss mit Regen gerechnet werden{chance}, bei Höchstwerten um {max}.',
          'Schirm bereithalten: {tag} ist Regen angesagt{chance}, bei bis zu {max}.',
        ],
        snow: ['{Tag} kann es schneien{chance}; mehr als {max} werden nicht erreicht.'],
        thunder: ['{Tag} drohen Gewitter{chance}, bei bis zu {max}.'],
        chance: ' (Wahrscheinlichkeit {p})',
        night: ['Nachts kühlt es auf {min} ab.'],
        frost: ['In der Nacht droht Frost bis {min}.'],
        heat: ['Es wird heiß – Rollläden auf der Sonnenseite rechtzeitig schließen.'],
        wind: ['Dazu weht kräftiger Wind mit bis zu {wind}.'],
        rooms: ['Drinnen zeigen die Fühler {liste}.', 'Im Haus werden {liste} gemessen.'],
        roomItem: '{wo} {temp} ({h})',
        roomItemNoHumidity: '{wo} {temp}',
        extremes: ['Am wärmsten ist es {warmWo} ({warmTemp}), am kühlsten {kaltWo} ({kaltTemp}).'],
        ventilate: ['{Wo} sollte gelüftet werden: Die Luftfeuchte liegt dort bei {h}.'],
        roomMissing: ['{Von} liegen derzeit keine Messwerte vor.'],
        noRooms: ['Aus den Räumen liegen derzeit keine Messwerte vor.'],
        headlines: {
          thunder: '{Tag} drohen Gewitter',
          frost: 'Frost in der Nacht',
          heat: 'Hitze: bis zu {max}',
          ventilate: 'Lüften {wo} empfohlen',
          rain: '{Tag} wird es nass',
          snow: '{Tag} droht Schnee',
          current: '{Zustand} bei {temp}',
          fallback: 'Das Wetter',
        },
        factboxTitle: 'Raumklima',
        tableRoom: 'Raum',
        tableTemp: 'Temp.',
        tableHumidity: 'Feuchte',
        outdoor: 'Außen',
      },
    },

    // -----------------------------------------------------------------------
    // Schaltkasten (klassische Schalter in der Randspalte)
    // -----------------------------------------------------------------------
    {
      id: 'switchboard',
      module: './sections/switchboard.js',
      enabled: true,
      kicker: 'Schaltkasten',
      // ✏️ ANPASSEN: Schalter. Unterstützt light, switch, input_boolean, fan …
      // (werden als Kippschalter gezeigt) sowie select/input_select (als
      // Segment-Auswahl; `labels` übersetzt die Optionen).
      items: [
        { entity: 'light.PLATZHALTER_wohnzimmer', label: 'Licht Wohnzimmer' },
        { entity: 'light.PLATZHALTER_flur', label: 'Licht Flur' },
        { entity: 'switch.PLATZHALTER_kaffeemaschine', label: 'Kaffeemaschine' },
        { entity: 'select.PLATZHALTER_evcc_lp1_mode', label: 'Lademodus', labels: EVCC_MODE_LABELS },
      ],
      texts: {
        unavailable: 'nicht verfügbar',
        placeholder: 'Platzhalter',
      },
    },
  ],
};
