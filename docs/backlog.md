# Backlog

Offene Wünsche an Kurt. Zeichnungen, Animationen und wiederverwendbare
Laufzeiten werden hier umgesetzt und danach über `tools/sync.py` an die
Verbraucher übergeben. Ein Eintrag hier ist noch kein Arbeitsauftrag.

## Sichtbares Atmen im Schlaf (Mutti-Export)

Owner-Wunsch 19.10.2026, gefunden auf der neuen Mutti-Anmeldeseite.

- Stand: Die Atmung ist eingebaut. `idle-sleep` („Schlafen · ruhig atmen“,
  30 s, Periode 6 s) wird in `source/animation-v12/build-idle.mjs` per
  `breathe()` erzeugt; auch der Mutti-Export enthält 360 Frames mit
  13 Atemstufen.
- Problem: Im Mutti-Profil (`cell` 256) unterscheidet sich die Silhouette
  zwischen Ein- und Ausatmen nur um etwa 1 px. Auf der Anmeldeseite wird
  Kurt mit rund 0,73 skaliert dargestellt; das Atmen ist praktisch nicht
  zu sehen.
- Ziel: Schlafatmung bei Mutti-Größe deutlich, aber ruhig erkennbar machen,
  ohne die freigegebene Zeichnung zu verändern. Mögliche Wege: Amplitude für
  kleinere Exporte anheben oder die Atmung im Renderer als leichte vertikale
  Torso-Skalierung ergänzen. Website- und Hauser-Größen mitprüfen.
- Abnahme: Vergleich der Extreme in Mutti-Größe, visuelle Prüfung gegen
  `references/`, `npm test`, anschließend Sync nach Mutti.

## Erbrochenes wieder aufessen

Owner-Wunsch 19.10.2026: Nach `vomit-floor` soll Kurt die Pfütze später
wieder auffressen und sie verschwindet.

- Stand: Nicht vorhanden. `vomit-floor` legt nur die Pfütze ab
  (`waste`/`deposit`); weder Atlas noch `runtime/web`, `runtime/ios` oder
  `runtime/mutti` kennen ein Wiederaufessen.
- Umfang: neue Zeichnungsfolge (z. B. hingehen, schnuppern, auflecken) mit
  Ereignis „Pfütze entfernt“, Verhalten in Web- und iOS-Kern, Aufnahme in die
  Profile (`profiles.json`) und Mutti-Renderer.

## Beschriftung des Pause-Schalters im Mutti-Renderer übersetzbar machen

Gefunden bei der Mutti-Anmeldeseite (19.10.2026): `runtime/mutti/kurt.js`
setzt „Kurt pausieren“, „Kurt weitermachen lassen“ und „Bewegung reduziert“
fest auf Deutsch. Die englische Mutti-Oberfläche braucht übergebbare
Beschriftungen.
