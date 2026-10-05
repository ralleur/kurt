# Development and shared consumers

Kurt ist der Mops von Ralleur. Hier liegen seine verbindlichen Zeichnungen,
Animationen und wiederverwendbaren Web- und iOS-Kerne. Hauser, der Mutti-
Installer und die Ralleur-Website beziehen ihren Kurt aus diesem Repository.

Zeichnungsstand: die freigegebene Fassung **kurt-a-refined-12** mit
27 Atlas-Seiten, 2.324 Frames einschließlich Haltebildern und Wiederholungen.
Die ursprünglichen Zeichnungen bleiben unverändert.

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
