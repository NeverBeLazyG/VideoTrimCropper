# DESIGN.md — Video Trim Cropper

> Format nach [google-labs-code/design.md](https://github.com/google-labs-code/design.md):
> maschinenlesbare Tokens (YAML) + menschenlesbare Begründung. Diese Datei ist die
> einzige Quelle der Wahrheit für `src/renderer/styles.css`.

## Design-Prinzip

**„Fokussierte Dunkelheit mit einem lebendigen Akzent."**

Die App ist ein Werkzeug, kein Schaufenster. Das Video steht im Mittelpunkt, alles
andere tritt in den Hintergrund: ein tiefes, neutrales Dunkel wie in der
Windows-Fotos-App. Ein einziger lila-magenta Akzent führt das Auge zu den
interaktiven Elementen — Trim-Griffe, aktive Timeline, primäre Aktion. Kein zweiter
Akzent konkurriert. Ruhige Flächen, weiche Radien, klare Typo.

## Tokens

```yaml
color:
  # Flächen (dunkel → hell gestaffelt)
  background:      "#1c1b1f"   # App-Hintergrund, tiefstes Neutral
  surface:         "#2b2930"   # Panels, Timeline-Pill, Buttons
  surfaceHover:    "#38353f"   # Hover auf Flächen
  surfaceActive:   "#44414c"   # gedrückt / aktiv
  border:          "#48454e"   # feine Trennlinien, Umrisse

  # Text
  textPrimary:     "#e6e1e5"   # Überschriften, Werte  (Kontrast 12.8:1 auf bg — AA/AAA)
  textSecondary:   "#cac4d0"   # Metadaten, Labels      (Kontrast 9.6:1 auf bg — AA/AAA)
  textDisabled:    "#79767d"   # deaktivierte Zustände

  # Akzent (Lila/Magenta)
  accent:          "#d0a2f7"   # Griffe, aktive Timeline, Fokus (Kontrast 8.1:1 auf bg — AAA)
  accentStrong:    "#c77dff"   # Hover/aktiver Akzent
  accentMuted:     "#5b4a6e"   # inaktive Akzent-Spur
  onAccent:        "#1c1b1f"   # Text/Icon auf Akzentfläche (Kontrast 8.1:1 — AAA)

  # Status
  danger:          "#f2b8b5"   # Fehlerhinweis
  scrim:           "rgba(0,0,0,0.55)"  # Overlay-Abdunklung (Crop, Modals)

typography:
  fontFamily:      "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif"
  fontFamilyMono:  "'Cascadia Mono', 'Consolas', ui-monospace, monospace"
  size:
    xs:   "12px"
    sm:   "13px"
    base: "14px"
    lg:   "16px"
    xl:   "20px"
    time: "28px"    # große Zeitanzeige über der Timeline
  weight:
    regular:  "400"
    medium:   "500"
    semibold: "600"
  lineHeight:      "1.4"
  # Zeitwerte immer mit tabular-nums, damit Ziffern nicht springen
  numeric:         "font-variant-numeric: tabular-nums"

spacing:            # 4px-Basisskala
  xs:   "4px"
  sm:   "8px"
  md:   "12px"
  lg:   "16px"
  xl:   "24px"
  xxl:  "32px"

radius:
  sm:   "6px"
  md:   "8px"
  lg:   "12px"
  pill: "999px"     # Timeline-Pill, Trim-Track

elevation:
  panel:  "0 2px 8px rgba(0,0,0,0.35)"
  popover:"0 8px 24px rgba(0,0,0,0.45)"

motion:
  fast:   "120ms ease"
  base:   "180ms ease"
```

## Komponenten

```yaml
components:
  button.primary:      # „Als Kopie speichern"
    backgroundColor: color.accent
    textColor:       color.onAccent
    hover:           color.accentStrong
    radius:          radius.md
    padding:         "10px 18px"
    fontWeight:      weight.semibold
  button.secondary:    # „Abbrechen", „Öffnen"
    backgroundColor: color.surface
    textColor:       color.textPrimary
    hover:           color.surfaceHover
    border:          color.border
    radius:          radius.md
    padding:         "10px 18px"
  button.ghost:        # Icon-Buttons (Play, …)
    backgroundColor: transparent
    textColor:       color.textSecondary
    hover:           color.surfaceHover
  timeline.track:
    backgroundColor: color.accentMuted
    radius:          radius.pill
  timeline.range:      # ausgewählter Bereich zwischen den Griffen
    backgroundColor: color.accent
  timeline.handle:     # In-/Out-Griff
    backgroundColor: color.accent
    onAccent:        color.onAccent
    radius:          radius.sm
  timeline.playhead:
    backgroundColor: color.accentStrong
  crop.rect:
    border:          color.accent
    handle:          color.accent
    outside:         color.scrim   # abgedunkelter Bereich außerhalb des Crops
```

## Regeln

1. **Ein Akzent.** Nur `accent`/`accentStrong` für Interaktion. Keine zweite Signalfarbe außer `danger` für echte Fehler.
2. **Kontrast AA+.** Alle Text/Fläche-Paare ≥ 4.5:1 (Werte oben geprüft).
3. **Zeit = Mono-Tabular.** Jede Zeitangabe nutzt `numeric`, damit die Anzeige beim Scrubben nicht zappelt.
4. **Weiche Radien.** Flächen `md`/`lg`, alles Timeline-artige `pill`.
5. **Das Video führt.** Maximaler Raum für die Vorschau; Chrome (Bars, Timeline) bleibt kompakt und ruhig.
