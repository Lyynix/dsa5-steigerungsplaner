# DSA5 - Steigerungsplaner

Ein Foundry-VTT-Modul für das [DSA5-System](https://github.com/Plushtoast/dsa5-foundryVTT), mit dem die Spieler Steigerungen von Talenten, Kampftechniken, Zaubern, Liturgien, Eigenschaften und Basiswerten sowie den Rückkauf permanenter AsP/KaP planen können, statt sie sofort auszuführen.

## Was macht das Modul?

Im DSA5-Charakterbogen steigert ein Klick auf "+" sofort und zieht die AP direkt ab. Der Steigerungsplaner fügt einen zweiten Modus hinzu:

- **Shift-Klick auf "+"** neben einem Talent, einer Kampftechnik, einem Zauber, einer Liturgie, einer Eigenschaft, einem Basiswert (Lebenskraft/Astralenergie/Karmaenergie) oder beim Rückkauf permanenter AsP/KaP plant die nächste Steigerung, statt sie auszuführen. Es werden keine AP abgezogen.
- **Shift-Klick auf "-"** nimmt die zuletzt geplante Steigerung für dieses Ziel wieder zurück. Sind keine Steigerungen geplant, plant er stattdessen eine Verringerung, z. B. um Punkte von einem Talent auf ein anderes umzuverteilen. Umgekehrt nimmt Shift-Klick auf "+" eine geplante Verringerung zurück.
- Ein neuer **"Steigerungsplaner"-Tab** im Charakterbogen zeigt alle geplanten Schritte, gruppiert wie im Talente-Tab (Körpertalente, Gesellschaftstalente, Naturtalente, Wissenstalente, Handwerkstalente, Kampftechniken, Zauber, Liturgien, Eigenschaften, Basiswerte). Jeweils mit Icon, den einzelnen Schritten und deren AP-Kosten.
- Direkt neben jedem "+"-Button im restlichen Charakterbogen zeigt ein kleines Badge (z. B. `+3`, bei geplanten Verringerungen rot, z. B. `-2`), wie viele Schritte für diesen Wert geplant sind, inklusive Tooltip mit den Details.
- Der Tooltip der "+"/"-"-Buttons im Charakterbogen weist zusätzlich auf den Shift-Klick hin.
- Steigert man normal (ohne Shift) einen Wert, für den bereits Schritte geplant sind, wird automatisch der passende geplante Schritt aus der Liste entfernt. Nimmt man eine reale Steigerung per "-" wieder zurück, wird der zugehörige Plan-Eintrag automatisch wiederhergestellt.
- Der Steigerungsplaner-Tab und alle Plan-Aktionen stehen nur Spieler:innen mit **Owner**-Rechten auf den jeweiligen Charakter zur Verfügung (Beobachter/Begrenzt sehen den Tab gar nicht). GMs sind auf jeden Charakter automatisch Owner.

### Im Steigerungsplaner-Tab

Die geplanten Schritte eines Ziels bauen aufeinander auf (z. B. Kraftakt 5→6, dann 6→7). Angewendet wird deshalb immer von vorne.

- **Pfeil** neben dem Namen: wendet den vordersten Schritt an, also die reale Steigerung inklusive AP-Abzug.
- **Klick auf eine Kachel**: wendet alle Schritte bis einschließlich dieser an, so weit die AP reichen.
- **X** beim Überfahren einer Kachel: verwirft diesen und alle folgenden Schritte.
- **Kästchen mit Plus**: hängt den nächsten Schritt an.
- **Mülleimer**: verwirft alle geplanten Schritte für dieses Ziel (mit Rückfrage).
- **"Ziel hinzufügen"** oben im Tab: öffnet eine durchsuchbare Liste aller Ziele, für die noch nichts geplant ist, und plant für das gewählte den ersten Schritt.
- Schritte, für die die verfügbaren AP gerade nicht reichen, werden abgedunkelt.

## Voraussetzungen

- Foundry VTT **Version 14**
- System [**DSA5**](https://foundryvtt.com/packages/dsa5)
- Modul [**libWrapper**](https://foundryvtt.com/packages/lib-wrapper) (wird als Abhängigkeit automatisch mitinstalliert/vorausgesetzt)

## Installation

1. Im Foundry-Modul-Browser nach "Steigerungsplaner" suchen, **oder**
2. über den Manifest-Link installieren:
   ```
   https://github.com/Lyynix/dsa5-steigerungsplaner/releases/latest/download/module.json
   ```
3. Modul im gewünschten Foundry-Welt-Setup aktivieren (libWrapper muss ebenfalls aktiv sein).

## Verwendung

1. Charakterbogen eines eigenen (Owner-)Charakters öffnen.
2. Steigerungen planen: im Bogen per **Shift+Klick auf "+"** (oder "-" für Verringerungen), oder im Tab **"Steigerungsplaner"** über **"Ziel hinzufügen"**.
3. Im Tab **"Steigerungsplaner"** die geplanten Schritte einsehen, ergänzen, anwenden oder verwerfen (siehe oben).

## Bekannte Einschränkungen

- Der Planer ist auf Charakterbögen (`character`) beschränkt; NSC-, Kreatur- und Fahrzeugbögen werden nicht unterstützt.

## Mitentwickeln

Issues und Pull Requests sind willkommen.
