# Changelog

Alle wichtigen Änderungen am Steigerungsplaner. Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionsnummern an [Semantic Versioning](https://semver.org/lang/de/).

## Unveröffentlicht

## 1.2.0 – 2026-10-09

### Hinzugefügt
- **Übersicht für den SL:** Das Fenster „Offene Anfragen“ wird zur Übersicht über die Planung aller Spielercharaktere, mit freien und verplanten AP, geplanten Steigerungen und Einträgen aus dem Katalog. Offene Anfragen stehen weiter oben zum Genehmigen. Der Button im Akteure-Verzeichnis heißt jetzt „Planer“ ([#46](https://github.com/Lyynix/dsa5-steigerungsplaner/issues/46)).

## 1.1.0 – 2026-10-08

### Hinzugefügt
- **Changelog:** Neue CHANGELOG.md, die unter anderem der [Big Bad Module Manager](https://foundryvtt.com/packages/bbmm) nach Updates anzeigt.
- **Ziel-FW für angefragte Zauber und Liturgien:** Beim Planen im Katalog und in der Anfrage lässt sich ein FW angeben, auf den der Zauber oder die Liturgie nach dem Erlernen steigen soll. Die Kosten zählen in die verplanten AP mit, nach der Genehmigung durch den SL stehen die Steigerungen als normale Schritte im Plan ([#41](https://github.com/Lyynix/dsa5-steigerungsplaner/issues/41)).
- **Erweiterungen für geplante Zauber und Liturgien:** Erweiterungen lassen sich schon planen, solange der Zauber oder die Liturgie nur angefragt ist. Anfragen kann man sie, sobald der Zauber gelernt ist und sein FW reicht ([#49](https://github.com/Lyynix/dsa5-steigerungsplaner/issues/49)).

### Geändert
- Die Anfragen im Planer-Tab sind nach Art und darin alphabetisch sortiert, Erweiterungen stehen direkt bei ihrem Zauber oder ihrer Liturgie.
- Kürzere Beschriftungen im Planer-Tab: „Wert planen“ statt „Ziel hinzufügen“, „Katalog“ statt „Sonderfertigkeiten & mehr“ (auch als Fenstertitel) und „… AP frei · … AP verplant“ als Zusammenfassung. Die ausführliche Erklärung steht jeweils im Tooltip.

### Behoben
- Die Buttons und die AP-Zusammenfassung im Kopf des Planer-Tabs brechen nicht mehr auf zwei Zeilen um ([#43](https://github.com/Lyynix/dsa5-steigerungsplaner/issues/43)).

## 1.0.0 – 2026-10-04

### Hinzugefügt
- **Sonderfertigkeiten, Vor- und Nachteile, Zauber & mehr planen und beim SL anfragen:** ein Auswahlfenster mit Suche (auch in den Beschreibungen), Filtern nach Kategorie und Buch, Details, AP-Kosten sowie Auswahl von Stufe und Variante. Geplante Einträge zählen in die geplanten Kosten mit, gestufte lassen sich über Stufen-Buttons ändern.
- **Genehmigung durch den SL:** Das Fenster „Offene Anfragen“ öffnet sich beim Login und bei neuen Anfragen. Genehmigen kauft den Eintrag über die Funktionen des Systems, Ablehnen geht mit Begründung. Im Planer-Tab kann der SL geplante Einträge direkt kaufen.
- **Zielwert eintippen:** Eine Zahl im Wertfeld plant die Steigerungen bis zu diesem Wert. Der SL setzt mit Strg+Enter weiterhin direkt. Neue Welt-Einstellung „Eingabefelder planen Steigerungen“ zum Abschalten.
- **„Ziel hinzufügen“** im Planer-Tab: durchsuchbare Liste aller Ziele, für die noch nichts geplant ist.
- **Kästchen mit Plus** in jeder Zeile hängt den nächsten Schritt an.

### Geändert
- Wird ein Wert direkt gesetzt, passt der Planer die Planung sofort an, statt erst beim nächsten Öffnen des Bogens.

### Behoben
- Die Rückgängig-Historie angewendeter Schritte wurde nie aufgeräumt und wuchs dauerhaft ([#19](https://github.com/Lyynix/dsa5-steigerungsplaner/issues/19)).

## 0.4.0 – 2026-08-29

### Hinzugefügt
- Rückkauf permanenter AsP/KaP planen.
- Der Tooltip der „+“/„-“-Buttons im Bogen weist auf den Shift-Klick hin.

## 0.3.0 – 2026-08-28

### Hinzugefügt
- Klick auf eine Kachel wendet alle Schritte bis dahin an, so weit die AP reichen.
- Das X an einer Kachel verwirft diesen und alle folgenden Schritte.
- Schritte, für die die AP nicht reichen, werden abgedunkelt. Beim Überfahren zeigt der Tab vorher, was angewendet oder verworfen wird.
- Animationen beim Anwenden und Verwerfen, Tooltips an allen Buttons.

## 0.2.1 – 2026-08-27

### Behoben
- Lange Schrittlisten scrollen jetzt waagerecht, statt in die nächste Zeile umzubrechen.
- Zeilen im Planer-Tab ließen sich versehentlich wie Items ziehen.

### Intern
- Neue Versionen erscheinen automatisch im Foundry-Paketverzeichnis.

## 0.2.0 – 2026-08-25

### Hinzugefügt
- Verringerungen planen, z. B. um Punkte von einem Talent auf ein anderes umzuverteilen.

### Geändert
- Ein Badge mit Vorzeichen statt je einem pro Button.

### Behoben
- Badge-Layout in engen Spalten (Kampftechniken, Eigenschaften).

## 0.1.0 – 2026-08-25

### Hinzugefügt
- Erste Version: Shift-Klick auf „+“ plant eine Steigerung, statt sie auszuführen. Der Planer-Tab zeigt alle geplanten Schritte mit AP-Kosten, Badges im Bogen zeigen die Anzahl.
- Normales Steigern nimmt den passenden geplanten Schritt aus dem Plan, Zurücknehmen stellt ihn wieder her.
- Nur Spieler mit Besitzer-Rechten sehen den Planer.
