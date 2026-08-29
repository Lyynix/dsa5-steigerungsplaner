# DSA5 - Steigerungsplaner

Ein Foundry-VTT-Modul für das [DSA5-System](https://github.com/Plushtoast/dsa5-foundryVTT), mit dem die Spieler Talent-, Kampftechnik-, Zauber-, Liturgie- und Eigenschaftssteigerungen planen können, statt sie sofort auszuführen.

## Was macht das Modul?

Im DSA5-Charakterbogen steigert ein Klick auf "+" sofort und zieht die AP direkt ab. Der Steigerungsplaner fügt einen zweiten Modus hinzu:

- **Shift-Klick auf "+"** neben einem Talent, einer Kampftechnik, einem Zauber, einer Liturgie, einer Eigenschaft oder einem Basiswert (Lebenskraft/Astralenergie/Karmaenergie) plant die nächste Steigerung, statt sie auszuführen. Es werden keine AP abgezogen.
- **Shift-Klick auf "-"** entfernt die zuletzt geplante Steigerung für dieses Ziel wieder.
- Ein neuer **"Steigerungsplaner"-Tab** im Charakterbogen zeigt alle geplanten Steigerungen, gruppiert wie im Talente-Tab (Körpertalente, Gesellschaftstalente, Wissenstalente, Handwerkstalente, Naturtalente, Kampftechniken, Zauber, Liturgien, Eigenschaften, Basiswerte). Jeweils mit Icon, den einzelnen geplanten Schritten und deren AP-Kosten.
- Direkt neben jedem "+"-Button im restlichen Charakterbogen zeigt ein kleines Badge (z. B. `+3`), wie viele Schritte für diesen Wert bereits geplant sind, inklusive Tooltip mit den Details.
- Im Steigerungsplaner-Tab kann jede geplante Steigerung einzeln **angewendet** (führt die reale Steigerung inkl. AP-Abzug aus) oder **verworfen** werden.
- Plant man mehrfach hintereinander (z. B. Kraftakt 5→6, dann 6→7), wird beim Anwenden immer der älteste Schritt zuerst ausgeführt; beim Verwerfen immer der zuletzt geplante zuerst entfernt.
- Steigert man normal (ohne Shift) einen Wert, für den bereits Schritte geplant sind, wird automatisch der passende geplante Schritt aus der Liste entfernt. Nimmt man eine reale Steigerung per "-" wieder zurück, wird der zugehörige Plan-Eintrag automatisch wiederhergestellt.
- Der Steigerungsplaner-Tab und alle Plan-Aktionen stehen nur Spieler:innen mit **Owner**-Rechten auf den jeweiligen Charakter zur Verfügung (Beobachter/Begrenzt sehen den Tab gar nicht). GMs sind auf jeden Charakter automatisch Owner.

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
2. Bei einem Talent, einer Kampftechnik, einem Zauber, einer Liturgie, einer Eigenschaft oder einem Basiswert mit **Shift+Klick auf "+"** eine Steigerung planen.
3. Im Tab **"Steigerungsplaner"** die geplanten Steigerungen einsehen, einzeln anwenden oder verwerfen.

## Bekannte Einschränkungen

- Der Planer ist auf Charakterbögen (`character`) beschränkt; NSC-, Kreatur- und Fahrzeugbögen werden nicht unterstützt.

## Mitentwickeln

Issues und Pull Requests sind willkommen.
