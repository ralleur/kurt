# Kostüme auf der bestehenden Figur

Artwork und Registrierungsdaten: Kurt by Ralleur, CC BY 4.0.
Build-Code und Vorschau: AGPL-3.0-only.

`oma/sources/painted-parts.png` enthält separat gemalte Kostümteile aus
Built-in ImageGen: graue Locken mit Dutt und ein geblümter Arbeitskittel mit
Falten, Knöpfen, Tasche und Nähten. Kurts Figur wurde nicht neu erzeugt.
Prompt, tatsächliche Bildreferenzen und gewählte Ausgabe stehen in
[`oma/sources/prompt.txt`](oma/sources/prompt.txt). Die SVG-Quellen für Haare
und Stoff dienen als Layoutvorlagen; Brille, Seitenbrille und Kragen bleiben
präzise ausgerichtete SVG-Teile. Quellen der unveränderten Figur:
`../animation-v8/cels/` und die registrierten Tragezeichnungen aus
`../animation-v10/sources/carry.png`.

`rig.json` registriert die Augenlinie, Körperfläche, Schwanz, angehobene Pfoten und Blickseite
jeder gezeichneten Pose in einer gemeinsamen 300-Einheiten-Arbeitsansicht.
`crown` registriert zusätzlich zwei Punkte auf der tatsächlichen Schädelkontur,
unabhängig von Augenlinie und Brillenlage. `crownReference` beschreibt die
entsprechenden Punkte in der 512px-Kostümvorlage. Bei verdeckter Schädelkante
ist die Kontur aus der passenden Kopfpose registriert. `earContours` schützt
die Originalohren vor den Haaren, auch in Seiten- und Rückenansichten.
Diese Befestigungspunkte gehören zur Figur und werden von weiteren Kostümen
wiederverwendet. Die Originalaugen, Schnauze, Ohren, Pfotenkontakte und der
Schwanz bleiben vor dem Stoff sichtbar. Fehlende Registrierungen brechen den
Build ab, statt ein schwebendes Ersatzkostüm auszugeben.

`dress.mjs` legt die Kostümteile auf die registrierten Zeichnungen, bevor
Gehen, Atmung und Kopfneigung mit der vorhandenen Baukette verformt werden.
Gesichtsausdrücke und Pupillenbewegungen werden zuerst auf der Originalfigur
eingesetzt. Danach vergrößert `optics` die fertigen Augen innerhalb der
registrierten Glasflächen um den konfigurierten Faktor (Oma: 1,55). Die
Fassung und alle Pixel außerhalb der Gläser bleiben dabei fest; geschlossene
Lider werden durch dieselben Gläser abgebildet. Erst danach folgen Atmung
und Kopfneigung. Die
Zauberwolke reicht in der Kostümvariante höher, um auch den Dutt vollständig
zu verdecken. Timing, Spiegelung, Kontakte und Ereignisse sind identisch.

Ein neues Kostüm erhält eigene Teile in `catalog.json` mit denselben
512px-Koordinaten wie die Oma-Teile. Kragen (`neck`) und Brille liegen auf den neutralen
Augenpunkten (120,220)/(191,244), der Kopf auf `crownReference`, der Körper im Bereich (115,252)–(470,439).
Die Rückenvarianten heißen `headBack` und `bodyBack`, die Seitenbrille
`eyesProfile`; `headProfile` passt dieselben Haarteile an die verkürzte
Seitenansicht an. Ein Teil kann ein SVG-Pfad oder ein Rasterdescriptor mit
`file`, `crop: [x,y,width,height]` und `place: [x,y,width,height]` sein.
`profileEye` im Figuren-Rig registriert das tatsächlich sichtbare Auge bei
Seitenansichten unabhängig von der projizierten Kopfachse. Die Kleidungsmaske
begrenzt den Stoff auf den Torso; explizite Pfotenmasken schützen auch die
angehobenen Vorderpfoten und sichtbaren Ballen. Der Kragen wird auf den Stoff
geclippt und verschwindet beim Vorbeugen durch Verdeckung, nicht durch einen
Schwellwert oder einen Wechsel der Animation.

`npm run export` baut fehlende/veraltete Kostüme automatisch in `.build/`
und liefert sie mit denselben Zelladressen neben den Originalatlanten aus.
Der Export prüft identische vollständige Animationsmanifeste. Die gemeinsame
Deduplizierung berücksichtigt Original und alle Kostüme zusammen.
Neue Kostüme benötigen keine Kopien der Clips und keine Änderungen an den
Verhaltensmodulen. Die Verbraucher wählen nur eine andere `pages`-Liste.

Nach dem Export `preview.html` über einen HTTP-Server aus dem Repository
öffnen. Alle Aktionen, beide Richtungen, 128/256/512 px, Einzelbilder und
helle/dunkle Hintergründe sind gegen Original und Referenz prüfbar.

Bei überlappenden oder angehobenen Beinen ergänzen `pawContours` geschlossene
Konturen im gemeinsamen 300-Einheiten-System; sie erhalten die vollständige
Vorderpfote einschließlich ihres Handgelenks. `cuffs` beschreibt die dahinter
liegende Ärmelkante. Runde Schutzmasken in `paws` reichen für die Ballen der
Hinterpfoten; für ausgestreckte Vorderarme würden sie sichtbare ovale Löcher
in den Stoff schneiden und sind dort ungeeignet.

Bei seitlich hinter dem Körper liegenden Ringelschwänzen folgt die Maske
innerhalb der registrierten Schwanzregion der Original-Tintenkontur. So bleibt
der ganze Schwanz erhalten, ohne eine ovale kahle Stelle im Kittel zu erzeugen.
In der Rückenansicht liegt der Schwanz vor dem Stoff und nutzt die direkte
Schutzmaske. `headContour` kann eine abweichende Kopfkontur im 300er-System
registrieren. Für seltene frontal gedrehte Köpfe trennen `headTransform` und
`eyewearTransform` die Haar- und Brillenbefestigung; diese affinen Matrizen
verwenden die 512px-Masterkoordinaten.
