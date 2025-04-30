# node-red-contrib-adiosun

Węzeł Node-RED do sterowania urządzeniami Adiosun z zaawansowanymi możliwościami sieciowymi i interakcją z przyciskami.

## Funkcje

- Automatyczne wykrywanie urządzeń w sieci lokalnej
- Komunikacja API z urządzeniami Adiosun
- Zarządzanie statusem urządzenia i informacjami o utworze w czasie rzeczywistym
- Sterowanie głośnością i odtwarzaniem
- Integracja z systemem powiadomień
- Integracja z panelami Ampio
- Wyświetlanie informacji o utworze (artysta, tytuł)
- Obsługa trybów (WiFi, Bluetooth, USB, Analog)

## Instalacja

```bash
npm install node-red-contrib-adiosun
```

Lub zainstaluj bezpośrednio z menedżera palet Node-RED.

## Użycie

1. Dodaj węzeł Adiosun do swojego przepływu
2. Skonfiguruj ustawienia brokera MQTT
3. Kliknij "Skanuj sieć" aby wykryć urządzenia Adiosun
4. Wybierz urządzenie z listy
5. Skonfiguruj ustawienia wyświetlania (tryb ikon lub tekst)
6. Wdróż i zacznij sterować swoim urządzeniem

### Konfiguracja węzła

- **MAC Panel**: Unikalny identyfikator panelu Ampio 
- **Typ panelu**: Wybierz między:
  - 4 Ikony i tekst (1-12 wyświetlaczy)
  - 3 Linie tekstu (1-3 linie)
- **Numer wyświetlacza**: Dla trybu ikon (1-12)
- **Numer linii**: Dla trybu tekstu (1-3)
- **Auto-konfiguracja Ampio**: Automatyczna konfiguracja integracji z panelem Ampio

### Komendy

Węzeł obsługuje następujące komendy:
- Play/Pause
- Następny/Poprzedni utwór
- Sterowanie głośnością (+, -, ustaw wartość)
- Wyciszenie/Włączenie dźwięku
- Przełączanie trybów (WiFi, Bluetooth, USB, Analog)
- Ustawianie presetów
- Odtwarzanie powiadomień

### Wyjścia

Węzeł wysyła wiadomości statusu w formacie:

```javascript
{
    "topic": "status",
    "payload": {
        "artist": "Nazwa artysty",
        "title": "Tytuł utworu",
        "volume": 50,
        "status": "playing/paused",
        "mode": "wifi/bt/usb/analog"
    }
}
```

## Wymagania

- Node.js >= 14.0.0
- Node-RED >= 2.0.0
- Dostęp do sieci lokalnej z urządzeniami Adiosun
- Broker MQTT

## Licencja

MIT License
