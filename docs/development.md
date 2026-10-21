# Development and shared consumers

Kurt ist der Mops von Ralleur. Hier liegen seine verbindlichen Zeichnungen,
Animationen und wiederverwendbaren Web- und iOS-Kerne. Hauser, der Mutti-
Installer und die Ralleur-Website beziehen ihren Kurt aus diesem Repository.

Zeichnungsstand: die freigegebene Fassung **kurt-a-refined-12** mit
27 Atlas-Seiten, 2.324 Frames einschließlich Haltebildern und Wiederholungen.
Die ursprünglichen Zeichnungen bleiben unverändert.

Offene Wünsche stehen im [Backlog](backlog.md).

## Was hier gepflegt wird

- `references/`: Casting A, die freigegebene Idle-Referenz und der neutrale Master.
- `source/`: registrierte Zeichnungen und die tatsächlich benötigte Baukette
  v8 → v9 → v10 → v12. Die Nummern dokumentieren Zeichnungsschritte, keine
  getrennten Produktimplementierungen. Alte Studien und Videos bleiben im
  historischen Hauser-Labor; sie sind keine aktive Quelle mehr.
- `assets/`: vollständiger kanonischer Atlas, Ereignisse und Effektzeichnungen.
- `runtime/ios/`: Geometrie, Bewegungen, Raumwege, Verdauung/Persistenz sowie
  UIKit-Renderer und Gesten. Ohne Abhängigkeit von Hauser-Modellen oder Farben.
- `runtime/web/`: Bewegung, Fütterung, Tragen und aktive Verdauungszeit.
- `runtime/mutti/`: der dekorative Fortschritts-Player des Installers. Seine
  Schrittsteuerung bleibt absichtlich anders als die autonome Website.
- `profiles.json`: benötigte Clips, Auflösung und Zielpfade der drei Verbraucher.
- `tools/export.py`: ein gemeinsamer Atlas-Exporter, verlustfreie WebP-Dateien,
  identische-Zellen-Deduplizierung und Herkunftsprüfsummen.

Hausers Raum-/Home-Assistant-Anbindung, Debugger und Objekterkennung bleiben
in Hauser. Website-DOM, Oberflächen, Beschriftungen und Installer-Fortschritt
bleiben ebenfalls beim jeweiligen Produkt. Ein Swift-Kern und ein Web-Kern
sind nötig; deren Unterschiede werden hier gepflegt, nicht in unabhängigen
Projektkopien. Die bestehenden spezifischen Manifestformate bleiben erhalten.

## Neue Animationen

Der bewährte Weg verbindet KI-unterstützte Einzelzeichnungen mit gezielter
programmatischer Bewegung und bewusst gesetzten Haltezeiten. Die vorhandenen
Quellen sind der Ausgangspunkt; neue Animationen erweitern diese Baukette.

1. **Aktion festlegen.** Start- und Endpose, Bodenkontakte, ungefähre Dauer und
   gegebenenfalls Loop oder Ereignis wie Schlucken festlegen. Vorhandene Posen
   und Zeichnungen wiederverwenden; zusätzliche Zeichnungen nur für neue
   Bewegung. Gang, Atmung und Blick haben bereits eigene Implementierungen.
2. **Identität binden.** `references/casting-a.png`, `neutral-master.png` und die
   passenden freigegebenen Posen in `source/animation-v8/cels/base/` verwenden.
   Bei Bildgenerierung die tatsächlichen Bilder anhängen, bei Übergängen beide
   Endposen. Casting A und die neutralen Proportionen bleiben verbindlich.
   Einen passenden vorhandenen Prompt anpassen, etwa
   [Hinsetzen](../source/animation-v8/sources/sit-inbetweens-prompt.txt),
   [Reaktionen](../source/animation-v8/sources/reactions-floor-prompt.txt) oder
   [Tragen](../source/animation-v10/sources/carry-prompt.txt).
3. **Gezielt zeichnen und ausrichten.** Nur die benötigte Folge erzeugen:
   vollständige Figuren mit transparentem Hintergrund, gleiche Kamera,
   Linksansicht in Dreiviertelperspektive, konstante Größe, Farben und Konturen.
   Zeichnungen auf die gemeinsame 512px-Arbeitsfläche ausrichten; Kopfgröße,
   Körpervolumen, Bodenlinie und Pfotenkontakte mit der Ausgangspose vergleichen.
   Nicht jede Pose einzeln auf Zellgröße strecken. Unpassende Zeichnungen
   korrigieren oder ersetzen, bevor Timing oder Laufzeit darauf aufbauen.
4. **In die vorhandene Baukette einbauen.** Quellen in `source/` ablegen und die
   zuständigen Build-Scripts ergänzen. Die bestehende Struktur für Clips,
   Haltezeiten bei 12 fps, Spiegelung und Ereignismarker nutzen; bei Bedarf
   Verbraucherprofile ergänzen. Beispiele sind
   [clips.mjs](../source/animation-v8/clips.mjs) und
   [build-carry.mjs](../source/animation-v10/build-carry.mjs).
5. **Die fertige Bewegung prüfen.** Nach `npm run artwork` die Animation
   tatsächlich abspielen und gegen `references/` vergleichen: in den vorgesehenen
   Anzeigegrößen und beiden Blickrichtungen, einschließlich Start, Ende und
   gegebenenfalls Loop. Gesicht und Körper bleiben konsistent, Pfoten tragen
   das Gewicht ohne Rutschen, nichts wird abgeschnitten; Pupillen bewegen keine
   Lider oder Fellpartien mit. Aktion und Ergebnis müssen lesbar sein und zu
   den Ereignismarkern passen. Ein Kontaktbogen allein reicht dafür nicht.
   Anschließend `npm test`; bei nativen Änderungen zusätzlich die betroffenen
   Hauser-Kurt-Tests. Erst danach nach dem unten beschriebenen Ablauf übernehmen.

Für die Herkunft genügen der verwendete Prompt und die gewählten Bildquellen
neben dem zuständigen Build-Script. Im Prompt kurz die angehängten
Referenzdateien in ihrer Reihenfolge, die gewählte Ausgabe und nötige
Aufbereitung festhalten. Bestehende Angaben erhalten; fehlende historische
Details nicht nachträglich erfinden. Generierte Atlanten und Vergleichsbilder
bleiben Build-Ergebnisse. Für neue Clips sind keine zusätzliche Pipeline,
Variantenarchive oder getrennte Review-Phase nötig.

### Szenen für kurtz.app

`source/landing-scenes/` enthält drei eigenständige Karten-Szenen: Videoabend
mit Popcorn, Laufband mit Messgeräten und Operator-Pult. Pro Szene werden nur
die feste Kulisse, der gewählte Zeichnungsbogen und der tatsächliche Prompt-
Verlauf aufbewahrt. `build.py` setzt die Zeichnungen mit festen Kontakten und
Haltezeiten zusammen; Band und Bildschirminhalte bewegen sich zusätzlich.
Die Szenen erweitern nicht den Atlas des frei laufenden Begleiters.

`npm run export:scenes` baut über `tools/export.py` transparente animierte
WebP-Dateien (768×512), verlustfreie Standbilder, Timing/Herkunftsprüfsummen und
eine lokale Vorschau unter `.build/landing-scenes/`. Das Übergabepaket liegt
unter `.build/kurt-landing-scenes.zip`. Keine neuen Laufzeit-Abhängigkeiten.
Für die Vorschau den Ordner über HTTP bereitstellen; `?review=1` aktiviert
zusätzlich die lokal erzeugten Einzelbilder. Hell/dunkel, Spiegelung, Pause
und reduzierte Bewegung sind in der Vorschau prüfbar. Bei der Einbindung die
Standbilder für reduzierte Bewegung, Pause und unsichtbare Karten verwenden.
Eine Einbindung in kurtz.app erfolgt im dortigen Auftrag.

## Einrichten und prüfen

Node.js und Python 3.10+:

```sh
npm ci
python3 -m pip install -r requirements.txt
npm test
```

Nur bei Zeichnungsänderungen: `npm run artwork` baut den gesamten Atlas aus
den enthaltenen Quellen neu, einschließlich der Prüfung unbeweglicher Lider.
Er erzeugt außerdem Vergleichsbilder unter `source/animation-v12/reviews/`.
Anschließend die veränderten Animationen mit der Referenz vergleichen und
`npm test` ausführen. `npm run export` erzeugt nur die Verbraucherpakete.

## Ein Update für alle Projekte

Die Verbraucher enthalten installierte Snapshots, damit sie offline bauen und
ohne GitHub-Zugang laufen. Das sind **generierte Abhängigkeiten**, keine Orte
zum Weiterentwickeln. `kurt.lock.json` hält Version, Git-Commit und den SHA-256
jeder verwalteten Datei fest. Ein Update wird niemals im laufenden Produkt
nachgeladen. Es kommt mit dessen nächstem regulären Build.

Nach einer Änderung: prüfen, Paketversion in `package.json`/Lockfile anheben,
Kurt committen und taggen, dann synchronisieren:

```sh
npm run export
python3 tools/sync.py --all --workspace /path/to/workspace
python3 tools/sync.py --all --workspace /path/to/workspace --check
```

Oder nur ein Projekt:

```sh
python3 tools/sync.py --consumer hauser --root /path/to/hauser-app-swift
python3 tools/sync.py --consumer mutti --root /path/to/mutti
python3 tools/sync.py --consumer website --root /path/to/ralleur-website/site
```

Bei allen Projekten werden zuerst sämtliche Konflikte geprüft, erst danach
wird geschrieben. Manuelle Änderungen an installierten Kurt-Dateien oder
veraltete Exporte stoppen den Vorgang. Beim ersten Import der bekannten
Altstände wird zusätzlich `--adopt` verwendet; auch dort müssen die alten
Prüfsummen exakt stimmen. Es gibt keinen stillen Force-Overwrite.

Ein früherer Stand lässt sich durch Checkout seines Kurt-Tags, erneuten
Export und denselben Sync installieren. Keine Git-Submodule, kein CDN,
kein zusätzlicher Dienst und kein Zugriff auf echte Haushalte nötig.

## Verbraucher

| Profil | Gemeinsamer Stand | Produktseitige Anbindung |
| --- | --- | --- |
| `hauser` | vollständiger Atlas, fünf Swift-Dateien | Hauser iOS, Raum- und Sitzflächen, versteckte Aktivierung |
| `mutti` | zehn Clips mit Originalauflösung, Installer-Player | lokaler Importfortschritt, Mac und Docker nutzen dieselbe Weboberfläche |
| `website` | neunzehn Clips mit 128px-Zellen, zwei Web-Module | Ralleur-Webseite, DOM-Flächen und Zeigerbedienung |

Andere Projekte können ein Profil ergänzen und dieselben Quellen beziehen.
Hausers Web-App erhält durch diese Extraktion keine Kurt-Funktion.

Öffentliche Freigabe ab Version 0.2.0: Code AGPL-3.0-only,
Zeichnungen CC BY 4.0; vorhandene Mutti-Dateien behalten GPL-2.0-or-later.
Siehe [LICENSE.md](../LICENSE.md).


## Große Website-Darstellung

`node tools/build-artwork.mjs --large` rendert die unveränderten 512px-Quellen
in einen separaten Atlas unter `.build/artwork-512/`. Der kanonische 256px-Atlas
für bestehende Verbraucher bleibt unverändert. `tools/export.py` baut diese
Variante bei veränderten Quellprüfsummen automatisch neu. Das Website-Profil
enthält zusätzlich `large/` mit 512px-Zellen und den dreizehn Bewegungs- und
Trageclips des großen Exponats. Die 128px-Dateien bleiben bytegleich.
Der rekursive Sync nimmt beide Größen in denselben geprüften Lock auf.
Die Website lädt und dekodiert die großen Seiten bedarfsgerecht; der kleine
Kurt verwendet weiterhin ausschließlich den kompakten Atlas.

### kurtz.app als Szenenverbraucher

Das Profil `kurtz-landing` übernimmt ausschließlich die drei Szenen mit ihren
Standbildern, Manifest und Artworkhinweisen unter `website/assets/kurt`. Keine
AGPL-Laufzeit-/Vorschauimplementierung wird in kurtz importiert.
Nach geprüftem Quellencommit: `python3 tools/export.py kurtz-landing`, dann
`python3 tools/sync.py --consumer kurtz-landing --root /Users/ai/workspace/vela-swiftfin`
und denselben Sync mit `--check`. Der Verbraucher darf nur seine eigene
Darstellung/Bewegungssteuerung ändern; Zeichnungen kommen aus diesem Repo.
