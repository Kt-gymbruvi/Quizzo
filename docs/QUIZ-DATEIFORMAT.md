# Quizzo-Dateiformat (Import/Export)

Quiz-Dateien sind JSON-Dateien mit der Endung `.quizzo.json`. Sie werden in „Meine Quizze“ über **Importieren** eingelesen und mit **⤓ Exportieren** erzeugt.

```json
{
  "format": "quizzo-quiz",
  "version": 1,
  "titel": "Titel des Quiz",
  "fragen": [ { "typ": "auswahl", "text": "…", "zeitlimit": 20, "punkte": 1, "...": "je nach Typ" } ]
}
```

Gemeinsame Felder jeder Frage:

| Feld | Bedeutung | Standard |
|---|---|---|
| `typ` | Fragetyp (siehe unten) | `auswahl` |
| `text` | Fragetext (bei Folien: Überschrift), max. 500 Zeichen | – (Pflicht) |
| `zeitlimit` | Sekunden, 5–240 | je nach Typ |
| `punkte` | `0` = keine, `1` = normal, `2` = doppelt (nur bei Typen mit Wertung) | `1` |
| `medium` | Bild, Ton oder Video zur Frage (nur am Beamer), siehe unten | keins |

## Felder je Fragetyp

| Typ | Felder | Beispiel |
|---|---|---|
| `auswahl` (Multiple Choice) | `antworten`: 2–6 Texte; `richtig`: Liste der Positionen (ab 0) | `"antworten": ["Lyon", "Paris"], "richtig": [1]` |
| `wahrfalsch` (Richtig/Falsch) | `richtig`: `true` oder `false` | `"richtig": false` |
| `freitext` | `loesungen`: 1–10 akzeptierte Antworten (Groß-/Kleinschreibung egal) | `"loesungen": ["Berlin", "BER"]` |
| `reihenfolge` (Sortieren) | `elemente`: 3–6 Texte in der richtigen Reihenfolge | `"elemente": ["Steinzeit", "Antike", "Mittelalter"]` |
| `zuordnung` | `paare`: 2–6 Paare `{ "links", "rechts" }` | `"paare": [{ "links": "Hund", "rechts": "bellt" }]` |
| `umfrage` | `antworten`: 2–6 Texte (keine Punkte) | `"antworten": ["Gut", "Geht so"]` |
| `wortwolke` | – (keine Punkte) | |
| `offen` (Offene Frage) | – (keine Punkte) | |
| `schieberegler` | `min`, `max`, `schritt`, `richtig`, `toleranz`, optional `einheit` | `"min": 1900, "max": 2000, "schritt": 1, "richtig": 1989, "toleranz": 2` |
| `folie` (Präsentationsfolie) | `folientext` (optional, max. 1000 Zeichen) | `"folientext": "Jetzt kommt Teil 2."` |

Längen: Antworten max. 120 Zeichen, Freitext-Lösungen max. 40, Sortier-Elemente max. 80, Zuordnungs-Begriffe max. 60.
Beim Import wird jede Frage geprüft; fehlerhafte Dateien werden mit einer Liste der Probleme abgelehnt.

## Medien (`medium`)

Jede Frage – auch eine Folie – kann ein Medium haben. Es erscheint nur am Beamer, nicht auf den Handys.

| Art | Felder | Beispiel |
|---|---|---|
| `bild` | `url` (https), optional `beschreibung` (max. 300 Zeichen) | `{ "art": "bild", "url": "https://upload.wikimedia.org/…/karte.png", "beschreibung": "Karte" }` |
| `audio` | `url` (https), optional `start`, `ende` (Sekunden) | `{ "art": "audio", "url": "https://…/ton.mp3", "start": 5 }` |
| `video` | `url` (https), optional `start`, `ende` | `{ "art": "video", "url": "https://…/film.mp4" }` |
| `youtube` | `id` oder `url` (YouTube-Link), optional `start`, `ende` | `{ "art": "youtube", "url": "https://youtu.be/…", "start": 15, "ende": 60 }` |

Im Editor hochgeladene Dateien bekommen beim Export ihre Adresse im Quizzo-Speicher (und `pfad`). Exportierte Dateien
funktionieren deshalb nur, solange das Original-Quiz mit diesen Medien existiert. Bilder aus dem Internet
(z. B. Wikimedia Commons) bitte nur verwenden, wenn die Lizenz das erlaubt.

Ein vollständiges Beispiel mit allen Fragetypen: [`beispiele/alle-fragetypen.quizzo.json`](../beispiele/alle-fragetypen.quizzo.json).
