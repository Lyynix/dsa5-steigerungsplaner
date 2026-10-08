# Mitentwickeln

Schön, dass du am Steigerungsplaner mitarbeiten willst! Diese Regeln gelten für alle, die etwas beitragen, egal ob Mensch oder KI-Assistent.

## Issues

- Jede Änderung beginnt mit einem Issue, auch kleine Bugs.
- Issues schreiben wir auf **Englisch**: ein kurzer Absatz, was das Problem oder der Wunsch ist, dann ein Abschnitt **implementation ideas** mit Ansätzen und Stolpersteinen, soweit schon bekannt.
- Label `bug` für Fehler, `feat` für neue Funktionen.
- Wird ein Feature zu groß, teilen wir es in Teil-Issues auf. Die laufen dann in einen Sammel-Branch, und erst der geht nach `main`.
- Designfragen klären wir im Issue, bevor es an den Code geht. Entscheidungen, die sich im Lauf der Arbeit ergeben, kommen als Kommentar dazu.

## Branches und Pull Requests

- Pro Issue ein Branch, benannt nach dem Issue mit `feat/` oder `fix/` davor, z. B. `fix/prune-stale-consumed-history`.
- Pull Requests gehen nach `main`, Teil-Issues in ihren Sammel-Branch.
- Die Beschreibung des PRs schließt die Issues mit `Closes #…`. Beim Sammel-PR nach `main` stehen dort alle Teil-Issues, denn GitHub schließt Issues nur bei Merges in den Standard-Branch.

## Commits

- Klein und in sich abgeschlossen: lieber mehrere Commits pro PR als ein großer.
- Commit-Messages auf **Englisch**, kurz, klein geschrieben, so wie man sie normal schreiben würde: `add level buttons to requests`, `fix badge layout in cramped columns`.

## Changelog

[CHANGELOG.md](CHANGELOG.md) hat oben immer einen Abschnitt `## Unveröffentlicht`. Jede Änderung, die Spieler oder SL bemerken, kommt dort mit ihrem PR hinein:

- Gegliedert in `### Hinzugefügt`, `### Geändert`, `### Behoben` und bei Bedarf `### Intern`.
- Auf Deutsch, kurz und aus Sicht der Nutzer, nicht des Codes.
- Links immer absolut (`https://github.com/…`). Der [Big Bad Module Manager](https://foundryvtt.com/packages/bbmm) zeigt die Datei in Foundry an, relative Links würden dort ins Leere zeigen.

Die Version setzt niemand von Hand. Beim Release macht der Workflow aus `## Unveröffentlicht` die Versionsüberschrift und legt einen neuen, leeren Abschnitt an (siehe [`.github/scripts/stamp-changelog.mjs`](.github/scripts/stamp-changelog.mjs)).

## README

Die [README](README.md) ist die Anleitung für Spieler und SL, auf Deutsch. Ändert sich, wie etwas bedient wird, ändert sich die README im selben PR mit. Screenshots liegen in `assets/` mit sprechenden Namen. Der Ordner kommt nicht ins Release-Zip.

## Code

- **Sprache:** Code, Kommentare und Bezeichner auf Englisch. Texte für Nutzer gehören nie in den Code, sondern als Schlüssel `STEIGERUNGSPLANER.…` in **beide** Sprachdateien, [`lang/de.json`](lang/de.json) und [`lang/en.json`](lang/en.json).
- **Stil:** So schreiben wie der Code drumherum. ES-Module, Controller als Klassen mit statischen Methoden, private Hilfen als `#methode`. Kommentare erklären, *warum* etwas so ist, nicht, was die Zeile tut.
- **Foundry:** Fenster als ApplicationV2 mit `HandlebarsApplicationMixin`. In den Charakterbogen greifen wir nur über [libWrapper](https://foundryvtt.com/packages/lib-wrapper) ein, nie durch Überschreiben von Methoden.
- **Daten:** Der Plan liegt in Flags des Akteurs (siehe [`scripts/planner-data.js`](scripts/planner-data.js)). Neue Felder müssen mit älteren, gespeicherten Daten ohne das Feld zurechtkommen.

## Grundsätze

- **Das System entscheidet.** Kosten, Käufe und Steigerungen laufen über die Funktionen des DSA5-Systems, z. B. die Kostentabelle, `_advanceItem` oder dessen Kaufweg für Sonderfertigkeiten. Wir bauen sie nicht nach, sonst laufen Planer und System auseinander.
- **Planen blockiert nicht.** Wer plant, darf über aktuelle Grenzen hinaus planen, etwa über ein Maximum, das erst eine geplante Eigenschaftssteigerung anhebt. Hinweise ja, Sperren nein. Geprüft wird beim Anwenden, und das macht das System.
- **Rechte:** Planen dürfen nur Besitzer des Charakters. Der SL darf alles und wird nie blockiert.
- **Nichts still kaputt machen:** Passt ein Plan nicht mehr zum Charakter, wird er angepasst oder mit Hinweis verworfen, aber nie stillschweigend falsch weitergeführt.

## Testen

- Es gibt keine automatischen Tests, getestet wird in Foundry. Vor jedem PR einmal durchspielen, was sich geändert hat, bei Anfragen und Genehmigungen am besten mit einem zweiten Client als Spieler.
- Foundry lädt geänderte Skripte erst nach einem Neuladen der Seite (F5).
- Schneller Syntax-Check ohne Foundry: `node --check scripts/<datei>.js`.
- Entwickelst du direkt in `Data/modules/dsa5-steigerungsplaner`: Kein „Update“ für das Modul in Foundry ausführen. Foundry ersetzt den Ordner dann durch das Release-Zip, und dein Git-Repo ist weg.

## Release

- Ein Release ist ein GitHub-Release mit einem Tag `vX.Y.Z` nach [Semantic Versioning](https://semver.org/lang/de/).
- Den Rest erledigt der Workflow: Er setzt die Version in `module.json` (die `#{…}#`-Platzhalter bleiben im Repo stehen), stempelt den Changelog, baut `steigerungsplaner.zip` und meldet die Version im Foundry-Paketverzeichnis an.
- Danach einmal `git pull`, weil der Workflow den Changelog auf `main` zurückschreibt.
