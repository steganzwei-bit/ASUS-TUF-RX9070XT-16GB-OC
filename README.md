# ASUS TUF RX 9070 XT – SignalRGB-SMBus-Plugin

Inoffizielles SignalRGB-Plugin zur Steuerung der vier RGB-LEDs einer **ASUS TUF Radeon RX 9070 XT Gaming OC** über AMD-ADLX/SMBus und den ENE-RGB-Controller.

## Unterstützte Hardware

| Wert        | Erwartet        |
| ----------- | --------------- |
| GPU Vendor  | `0x1002` (AMD)  |
| PCI Product | `0x7550`        |
| SubVendor   | `0x1043` (ASUS) |
| SubDevice   | `0x0613`        |
| I²C-Adresse | `0x67`          |
| LEDs        | 4               |

Das Plugin verweigert die Aktivierung, wenn die Identifikation oder die ENE-Signaturprüfung nicht exakt übereinstimmt.

## Sicherheitsmechanismen

- Prüft die exakte GPU-/ASUS-Kennung vor jeder Aktivierung.
- Prüft die ENE-Signatur in den Registern `0xA0` bis `0xA3`.
- Liest den vorhandenen Hardwaremodus vor der Steuerung aus.
- Schreibt nur LEDs, deren Farbe sich geändert hat.
- Prüft das erste RGB-Farbpaket durch Zurücklesen.
- Stoppt weitere RGB-Updates bei einem Schreib- oder Prüfungsfehler.
- Stellt beim Beenden den zuvor ausgelesenen Hardwaremodus wieder her.

## Installation

1. SignalRGB vollständig schließen.

2. `Asus_TUF_RX9070XT_SIGNALRGB.js` in den folgenden Ordner kopieren:

   ```text
   %USERPROFILE%\Documents\WhirlwindFX\Plugins\
   ```

3. SignalRGB neu starten.

4. Die GPU sollte als **ASUS TUF Radeon RX 9070 XT Gaming OC** erscheinen.

## Wichtige Hinweise

- **Armoury Crate / LightingService** und **OpenRGB** dürfen nicht gleichzeitig auf die GPU-Beleuchtung zugreifen.
- Dieses Plugin verwendet direkte SMBus-Schreibzugriffe. Obwohl es auf einer ASUS TUF RX 9070 XT Gaming OC mit der oben genannten Kennung getestet wurde, erfolgt die Nutzung auf eigenes Risiko.
- Zunächst mit statischen Farben oder langsamen Effekten testen, bevor schnelle Animationen oder Audio-Visualizer verwendet werden.
- Dies ist kein offizielles Plugin von ASUS, AMD oder SignalRGB.

## Getesteter Ablauf

Auf der Zielhardware wurden erfolgreich geprüft:

1. Erkennung der GPU und des ENE-Controllers
2. Auslesen der ENE-Signatur
3. Einmaliges Setzen einer grünen Testfarbe
4. Zurücklesen der RGB-Register
5. Wiederherstellung des vorherigen Hardwaremodus beim Beenden

Ein Langzeittest steht noch aus.
