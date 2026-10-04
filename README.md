# DSA5 - Steigerungsplaner

Ein Foundry-VTT-Modul für das [DSA5-System](https://github.com/Plushtoast/dsa5-foundryVTT), mit dem die Spieler Steigerungen von Talenten, Kampftechniken, Zaubern, Liturgien, Eigenschaften und Basiswerten sowie den Rückkauf permanenter AsP/KaP planen können, statt sie sofort auszuführen. Neue Sonderfertigkeiten, Vor- und Nachteile, Zauber, Liturgien und mehr lassen sich ebenfalls planen und beim SL anfragen.

## Was macht das Modul?

Im DSA5-Charakterbogen steigert ein Klick auf "+" sofort und zieht die AP direkt ab. Der Steigerungsplaner fügt einen zweiten Modus hinzu:

- **Shift-Klick auf "+"** neben einem Talent, einer Kampftechnik, einem Zauber, einer Liturgie, einer Eigenschaft, einem Basiswert (Lebenskraft/Astralenergie/Karmaenergie) oder beim Rückkauf permanenter AsP/KaP plant die nächste Steigerung, statt sie auszuführen. Es werden keine AP abgezogen.
- **Shift-Klick auf "-"** nimmt die zuletzt geplante Steigerung für dieses Ziel wieder zurück. Sind keine Steigerungen geplant, plant er stattdessen eine Verringerung, z. B. um Punkte von einem Talent auf ein anderes umzuverteilen. Umgekehrt nimmt Shift-Klick auf "+" eine geplante Verringerung zurück.
- **Eine Zahl in das Wertfeld eintippen** (Talent, Kampftechnik, Zauber, Liturgie, Steigerungen von Eigenschaften und Basiswerten, Rückkauf pAsP/pKaP) setzt den Wert nicht mehr direkt, sondern plant die Steigerungen bis zu diesem Zielwert. Bereits geplante Schritte werden dabei ergänzt oder gekürzt, eine kleinere Zahl plant Verringerungen. Der Bogen zeigt danach weiter den echten Wert. Der SL kann mit **Strg+Enter** den Wert wie gewohnt direkt setzen. Über die Welt-Einstellung "Eingabefelder planen Steigerungen" lässt sich das abschalten, z. B. beim Erschaffen von Charakteren.
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

### Sonderfertigkeiten, Vor- und Nachteile, Zauber & mehr

Neues, das der Charakter noch nicht hat, kauft man nicht Schritt für Schritt, sondern bekommt es vom SL genehmigt. Dafür gibt es oben im Tab den Button **"Sonderfertigkeiten & mehr"**:

- Er öffnet ein Fenster mit allem, was der Charakter lernen könnte: Vor- und Nachteile, Sonderfertigkeiten (allgemein, Kampf, magisch, karmal), Zauber, Rituale, Zaubertricks, Liturgien, Zeremonien, Segnungen und Erweiterungen. Magisches sehen nur Zauberer, Karmales nur Geweihte. Die Liste stammt aus allen Kompendien, die der Spieler sehen darf, und berücksichtigt den Modulfilter der Bibliothek. Beim ersten Öffnen pro Sitzung wird sie einmal geladen.
- Suche nach Namen oder Kategorie, ab drei Buchstaben auch in den Beschreibungen (diese Treffer stehen ausgegraut am Ende ihrer Gruppe). Dazu Filter nach Kategorie und Buch. Unter jedem Eintrag steht, aus welchem Buch er stammt.
- Rechts stehen die Details des gewählten Eintrags: Voraussetzungen, Regeltext, Beschreibung und die AP-Kosten. Bei Bedarf wählt man dort Stufe und Variante (z. B. das Talent bei einer Begabung) und übernimmt den Eintrag mit **"Planen"** in den Plan.

Die geplanten Einträge stehen im Tab unter **"Anfragen"**, mit ihren geschätzten AP-Kosten. Sie zählen in die geplanten Kosten mit und werden abgedunkelt, wenn die AP nicht reichen.

- **Stufen-Buttons** (I, II, III, …) bei gestuften Einträgen: ändern die geplante Stufe. Der Tooltip zeigt, wie sich die Kosten dadurch ändern.
- **Papierflieger**: fragt den Eintrag beim SL an. Solange er dort liegt, lässt er sich nicht ändern, aber über den **Pfeil** zurückziehen.
- **Mülleimer**: verwirft den Eintrag.

Lehnt der SL ab, steht der Eintrag wieder als geplant im Tab, mit dem Hinweis "abgelehnt" und der Begründung als Tooltip. Bekommt der Charakter einen geplanten Eintrag auf anderem Weg (z. B. zieht der SL das Item direkt auf den Bogen), verschwindet er von selbst aus dem Plan.

### Für den SL

- Das Fenster **"Offene Anfragen"** listet alle angefragten Einträge aller Charaktere mit Variante, Stufe, geschätzten Kosten und Voraussetzungen. Es öffnet sich beim Login, wenn etwas offen ist, und sobald ein Spieler etwas anfragt. Über den Button **"Anfragen"** im Akteure-Verzeichnis lässt es sich jederzeit öffnen.
- **Haken**: genehmigt die Anfrage und kauft den Eintrag über die Funktionen des Systems, genau wie beim Ziehen auf den Bogen (AP-Prüfung, Abzug, AP-Tracker), nur ohne erneute Variantenauswahl.
- **Verbotsschild**: lehnt ab, optional mit Begründung.
- Im Steigerungsplaner-Tab eines Charakters sieht der SL statt "anfragen" direkt den Haken und kann geplante Einträge ohne Umweg kaufen.

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
2. Steigerungen planen: im Bogen per **Shift+Klick auf "+"** (oder "-" für Verringerungen), durch Eintippen des Zielwerts ins Wertfeld, oder im Tab **"Steigerungsplaner"** über **"Ziel hinzufügen"**.
3. Im Tab **"Steigerungsplaner"** die geplanten Schritte einsehen, ergänzen, anwenden oder verwerfen (siehe oben).
4. Neue Sonderfertigkeiten, Vor- und Nachteile, Zauber usw. über **"Sonderfertigkeiten & mehr"** planen und beim SL anfragen.

## Bekannte Einschränkungen

- Der Planer ist auf Charakterbögen (`character`) beschränkt; NSC-, Kreatur- und Fahrzeugbögen werden nicht unterstützt.
- Voraussetzungen werden nicht geprüft. Das System speichert sie nur als Freitext und prüft sie selbst auch nicht, die Entscheidung liegt beim SL.
- Die AP-Kosten von Anfragen sind eine Schätzung. Manche Varianten ändern die Kosten, und freie Sprachpunkte werden erst beim Kauf verrechnet. Es gilt, was das System beim Genehmigen abzieht.

## Mitentwickeln

Issues und Pull Requests sind willkommen.
