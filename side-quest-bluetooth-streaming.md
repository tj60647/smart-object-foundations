# Side Quest — Control a NeoPixel over Bluetooth LE

> **This is an optional extension.** It is not required for Smart Object Foundations. Come here when you want to cut the USB cable and control hardware wirelessly — specifically, setting the colour of the built-in NeoPixel on your ESP32 Feather from a browser page using Bluetooth Low Energy.

This side quest is deliberately small. There is one piece of hardware (the NeoPixel already on the board), one browser API (`navigator.bluetooth`), and one job: pick a colour in the browser and watch it appear on the device.

```
[browser colour picker]
        ↓
navigator.bluetooth write
        ↓
NimBLE characteristic on ESP32
        ↓
Adafruit_NeoPixel
        ↓
[NeoPixel glows that colour]
```

The progression moves from hardware-only to a live wireless colour picker in four steps:

| Stage | What you build | New skill |
|---|---|---|
| SQ-0 | ESP32 cycles through colours on boot | NeoPixel wiring and library |
| SQ-1 | ESP32 advertises a BLE service; NeoPixel shows connection state | NimBLE on ESP32 |
| SQ-2 | Browser connects and sends preset colour commands | `navigator.bluetooth` |
| SQ-3 | Browser live colour picker changes the NeoPixel in real time | Continuous BLE writes |

---

## What You Need

**Hardware:**
- Adafruit ESP32 v2 Feather — the NeoPixel is already on the board at pin `0`; no extra wiring needed

**Arduino libraries** — install both from the Library Manager before starting:

| Library | Search term |
|---|---|
| Adafruit NeoPixel | `NeoPixel` by Adafruit |
| NimBLE-Arduino | `NimBLE-Arduino` by h2zero |

> **Why NimBLE?** NimBLE-Arduino is a lighter, faster BLE stack than the standard `BLEDevice` library bundled with the ESP32 board package. It uses significantly less RAM, compiles faster, and its API is cleaner. The single include `#include <NimBLEDevice.h>` replaces the four separate headers the standard library requires.

---

## SQ-0 — Wire Up and Verify the NeoPixel

Before adding any wireless code, confirm that the NeoPixel works and that you understand how to set a colour from a sketch.

**What you build:**
- On power-up the ESP32 cycles the NeoPixel through red, green, blue, white, and off
- Each colour holds for one second so you can see it clearly

**Arduino sketch:**

```cpp
#include <Adafruit_NeoPixel.h>

// The ESP32 v2 Feather has one NeoPixel, hard-wired to pin 0.
#define NEOPIXEL_PIN   0
#define NEOPIXEL_COUNT 1

Adafruit_NeoPixel pixel(NEOPIXEL_COUNT, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  pixel.begin();
  pixel.setBrightness(50); // 0–255; 50 is comfortable for desk use

  uint32_t colours[] = {
    pixel.Color(255,   0,   0),  // red
    pixel.Color(  0, 255,   0),  // green
    pixel.Color(  0,   0, 255),  // blue
    pixel.Color(255, 255, 255),  // white
    pixel.Color(  0,   0,   0),  // off
  };

  for (uint32_t c : colours) {
    pixel.setPixelColor(0, c);
    pixel.show();
    delay(1000);
  }
}

void loop() {}
```

> **📐 Concept Sidebar: NeoPixels**
>
> A NeoPixel (WS2812B) is an addressable RGB LED with a tiny control chip built in. You drive any number of them from a single GPIO pin by sending a timed serial stream of colour data. The `Adafruit_NeoPixel` library handles the timing.
>
> Three calls do most of the work:
> - `pixel.setPixelColor(index, pixel.Color(r, g, b))` — loads a colour into the library’s buffer (0–255 per channel)
> - `pixel.show()` — flushes the buffer to the hardware; nothing changes on the LED until you call this
> - `pixel.setBrightness(n)` — scales every colour by `n÷255`; set this once in `setup()` so the LED is not blinding at full power
>
> `pixel.Color(r, g, b)` packs three bytes into a 32-bit integer. Calling `pixel.Color(255, 0, 0)` is pure red at full brightness; `pixel.Color(0, 40, 0)` is a dim green. The Feather’s built-in NeoPixel is on **pin 0** — no soldering or wiring needed.

**Deliverable:** Upload the sketch and watch the built-in NeoPixel cycle through five colours. If any colour is missing or the LED does not light, check that the Adafruit NeoPixel library is installed and that you have selected the correct board (Adafruit ESP32 Feather V2) in the Arduino IDE.

---

## SQ-1 — BLE Advertisement

Add NimBLE so the ESP32 is discoverable over Bluetooth. No browser code yet — use the **nRF Connect** app (free, iOS and Android) to find the device and write a colour by hand. The NeoPixel shows red while advertising and green when a central connects.

**What you build:**
- ESP32 advertises a BLE peripheral named `"ColorLight"`
- One writable characteristic accepts a 6-character hex colour string (`"FF0000"` for red, `"00FF00"` for green, etc.)
- NeoPixel: red = advertising, green = connected, changes to the sent colour on each write

**Arduino sketch:**

```cpp
#include <Adafruit_NeoPixel.h>
#include <NimBLEDevice.h>

#define NEOPIXEL_PIN   0
#define NEOPIXEL_COUNT 1

// Custom 128-bit UUIDs. Keep these values identical in the SQ-2/SQ-3 browser sketch.
#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define COLOR_UUID   "beb5483e-36e1-4688-b7f5-ea07361b26a8"

Adafruit_NeoPixel pixel(NEOPIXEL_COUNT, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);

// Parse a 6-character hex string ("FF8000") into r, g, b components.
// Returns false if the string is not exactly 6 hex characters.
bool hexToRgb(const std::string& hex, uint8_t& r, uint8_t& g, uint8_t& b) {
  if (hex.length() != 6) return false;
  r = (uint8_t) strtol(hex.substr(0, 2).c_str(), nullptr, 16);
  g = (uint8_t) strtol(hex.substr(2, 2).c_str(), nullptr, 16);
  b = (uint8_t) strtol(hex.substr(4, 2).c_str(), nullptr, 16);
  return true;
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*) override {
    Serial.println("Connected.");
    pixel.setPixelColor(0, pixel.Color(0, 40, 0)); // green = connected
    pixel.show();
  }
  void onDisconnect(NimBLEServer*) override {
    Serial.println("Disconnected — advertising again.");
    pixel.setPixelColor(0, pixel.Color(40, 0, 0)); // red = advertising
    pixel.show();
    NimBLEDevice::startAdvertising();
  }
};

class ColorCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pChar) override {
    std::string val = pChar->getValue();
    uint8_t r, g, b;
    if (hexToRgb(val, r, g, b)) {
      pixel.setPixelColor(0, pixel.Color(r, g, b));
      pixel.show();
      Serial.printf("Colour: #%s\n", val.c_str());
    } else {
      Serial.printf("Invalid colour — expected 6 hex chars, got: %s\n", val.c_str());
    }
  }
};

void setup() {
  Serial.begin(115200);
  delay(500);

  pixel.begin();
  pixel.setBrightness(50);
  pixel.setPixelColor(0, pixel.Color(40, 0, 0)); // red = not yet connected
  pixel.show();

  NimBLEDevice::init("ColorLight");

  NimBLEServer* pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  NimBLEService* pService = pServer->createService(SERVICE_UUID);

  NimBLECharacteristic* pColor = pService->createCharacteristic(
    COLOR_UUID,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  pColor->setCallbacks(new ColorCallbacks());

  pService->start();
  NimBLEDevice::startAdvertising();
  Serial.println("Advertising as \"ColorLight\".");
}

void loop() {
  delay(10);
}
```

**How to test with nRF Connect:**

1. Open nRF Connect on your phone and tap **Scan**.
2. Find **ColorLight** and tap **Connect**.
3. The NeoPixel switches from red to green.
4. Open the service, find the colour characteristic, and tap the **write** icon (pencil).
5. Type `FF0080` (a magenta) and confirm — the NeoPixel should change immediately.
6. Try `FF0000` (red), `00FF00` (green), `0000FF` (blue), `000000` (off).

> **📐 Concept Sidebar: NimBLE vs. the Standard BLE Library**
>
> The ESP32 Arduino core ships with a BLE library based on Bluedroid (the same stack Android uses). It works, but it carries the full Bluedroid weight — roughly 80 KB of RAM at runtime. **NimBLE-Arduino** uses Apache’s NimBLE stack instead, a lean implementation written specifically for constrained devices. It typically uses 25–30 KB of RAM for the same functionality.
>
> The API mirrors the standard library closely, with two key differences you will notice in every sketch:
> 1. **One include** — `#include <NimBLEDevice.h>` is all you need. The standard library requires four.
> 2. **NIMBLE_PROPERTY flags** — characteristic permissions are set with `NIMBLE_PROPERTY::WRITE` rather than `NimBLECharacteristic::PROPERTY_WRITE`. The flag names are the same; only the namespace changes.
>
> NimBLE also automatically adds the BLE2902 Client Characteristic Configuration Descriptor (CCCD) to any notify/indicate characteristic — you do not need to call `addDescriptor(new NimBLE2902())` manually.

**Deliverable:** The NeoPixel glows red while the ESP32 is advertising. Connecting in nRF Connect turns it green. Writing `FF8000` in nRF Connect turns it orange.

---

## SQ-2 — Browser Colour Buttons

Replace nRF Connect with a browser page. The p5.js sketch connects to `ColorLight` through the Web Bluetooth API (`navigator.bluetooth`) and sends a colour when you click one of four preset buttons.

No hardware changes are needed. The SQ-1 Arduino sketch runs unchanged.

> **Browser note:** `navigator.bluetooth` requires Chrome or Edge and a **secure context** (HTTPS or localhost). The same browsers that support WebSerial in the main project work here. Firefox does not support the Web Bluetooth API.

**p5.js sketch (`sketch.js`):**

```js
// UUIDs must match the Arduino sketch exactly (lowercase is fine).
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const COLOR_UUID   = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let colorChar = null;
let connected = false;

// Connect to the ESP32 through the browser Bluetooth device picker.
async function connectBLE() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
    });
    device.addEventListener("gattserverdisconnected", () => {
      connected = false;
      colorChar = null;
    });
    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    colorChar     = await service.getCharacteristic(COLOR_UUID);
    connected     = true;
  } catch (err) {
    console.error("BLE error:", err);
  }
}

// Send a 6-character hex string to the ESP32 (no "#" prefix).
async function sendColor(hex) {
  if (!colorChar) return;
  await colorChar.writeValueWithoutResponse(new TextEncoder().encode(hex));
}

// --- p5.js ------------------------------------------------------------------
const PRESETS = [
  { label: "Red",    hex: "FF0000" },
  { label: "Green",  hex: "00FF00" },
  { label: "Blue",   hex: "0000FF" },
  { label: "Off",    hex: "000000" },
];

function setup() {
  createCanvas(400, 220);

  createButton("Connect").mousePressed(connectBLE);

  for (const p of PRESETS) {
    createButton(p.label).mousePressed(() => sendColor(p.hex));
  }
}

function draw() {
  background(30);
  fill(connected ? color(0, 200, 100) : color(180));
  noStroke();
  ellipse(20, 20, 12, 12);
  fill(255);
  textSize(13);
  text(connected ? "connected" : "not connected", 30, 25);
}
```

**`index.html`:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>NeoPixel BLE</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
</head>
<body style="background:#1e1e1e; margin:0;">
  <script src="sketch.js"></script>
</body>
</html>
```

**How to run:**

1. Upload the SQ-1 Arduino sketch (no changes needed).
2. **OpenProcessing (recommended):** Create a new OpenProcessing sketch, paste the `sketch.js` code above, and run it in Chrome or Edge.
3. Click **Connect** — the device picker shows **ColorLight**.
4. Click **Red**, **Green**, **Blue**, **Off** and watch the NeoPixel respond.
5. **Local fallback (optional):** serve the files and open `http://localhost:8000` in Chrome or Edge.
  - `python3 -m http.server`
  - `python -m http.server`
  - `py -m http.server` (Windows)

> **📐 Concept Sidebar: Web Bluetooth (`navigator.bluetooth`)**
>
> `navigator.bluetooth` is a browser API that lets a web page talk directly to nearby Bluetooth Low Energy peripherals — no native app, no driver, no USB cable required.
>
> The flow has three steps:
> 1. **Discover** — `requestDevice()` opens the browser’s built-in device picker. The `filters` option restricts the list to devices advertising the service UUID you specify, so the user only sees relevant hardware.
> 2. **Connect** — `device.gatt.connect()` opens a GATT connection; `getPrimaryService()` and `getCharacteristic()` navigate the peripheral’s attribute tree to the specific data point you want.
> 3. **Write** — `writeValueWithoutResponse()` sends bytes to a writable characteristic. The ESP32’s `onWrite` callback fires immediately.
>
> `writeValueWithoutResponse()` matches `NIMBLE_PROPERTY::WRITE_NR` on the ESP32 side — no acknowledgement is sent, which gives the lowest possible latency. For colour control at human interaction speeds this is the right choice; if you needed guaranteed delivery (as for a safety-critical command) you would use `writeValue()` with `NIMBLE_PROPERTY::WRITE` instead.

**Deliverable:** Clicking the browser buttons changes the NeoPixel colour over Bluetooth with no USB cable connected.

---

## SQ-3 — Live Colour Picker

Replace the preset buttons with an HTML colour picker. Every time you change the colour, the browser sends the new hex value to the ESP32 and the NeoPixel updates immediately.

No Arduino changes are needed. Update only the p5.js sketch.

**p5.js sketch (`sketch.js`):**

```js
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const COLOR_UUID   = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let colorChar = null;
let connected = false;
let picker;

async function connectBLE() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
    });
    device.addEventListener("gattserverdisconnected", () => {
      connected = false;
      colorChar = null;
    });
    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    colorChar     = await service.getCharacteristic(COLOR_UUID);
    connected     = true;
  } catch (err) {
    console.error("BLE error:", err);
  }
}

async function sendColor(hex) {
  if (!colorChar) return;
  await colorChar.writeValueWithoutResponse(new TextEncoder().encode(hex));
}

function setup() {
  createCanvas(400, 220);

  createButton("Connect").mousePressed(connectBLE);

  // createColorPicker() wraps a native <input type="color"> element.
  // The .input() callback fires every time the user moves the colour swatch.
  picker = createColorPicker("#ff0000");
  picker.input(() => {
    if (!connected) return;
    // picker.value() returns "#rrggbb"; strip the leading "#" before sending.
    sendColor(picker.value().slice(1).toUpperCase());
  });
}

function draw() {
  // Show the chosen colour as the canvas background when connected.
  background(connected ? picker.color() : color(30));

  fill(connected ? color(0, 0, 0, 160) : color(255));
  noStroke();
  textSize(14);
  textAlign(CENTER, CENTER);
  text(connected ? "pick a colour" : "not connected", width / 2, height / 2);
}
```

> **📐 Concept Sidebar: Why the Colour Picker Needs No Throttling**
>
> The HTML colour picker fires its `input` event each time the user drags the swatch, which can be dozens of times per second. In the browser-to-ESP32 side quest, fast-firing events (like `mousemove`) needed throttling to avoid flooding the ESP32’s serial buffer.
>
> BLE handles this differently. `writeValueWithoutResponse()` on the browser side is **non-blocking** — it queues a write and returns immediately. The browser’s GATT layer serialises the queue, so rapid calls naturally pace themselves without an explicit `setInterval` guard. If the queue fills (unusual at colour-picker speeds), the promise rejects; wrapping `sendColor` in a try/catch handles that gracefully.
>
> The result: no throttle needed. The NeoPixel updates as fast as the colour picker moves — typically 20–50 Hz on a trackpad, well within what BLE can handle.

**Deliverable:** Dragging the colour picker swatch smoothly changes the NeoPixel in real time. The canvas background mirrors the current colour so you can compare it to the physical LED.

---

## Where to Go Next

- **Brightness slider** — add an HTML `<input type="range">` that sends `BRIGHT:0–255` as a second BLE write to a second characteristic. The ESP32 calls `pixel.setBrightness()` on each write.

- **Multiple NeoPixels** — change `NEOPIXEL_COUNT` to match a strip or ring. Send `"index:RRGGBB"` (e.g. `"03:FF0080"`) to set individual pixels independently.

- **Animate on the ESP32** — instead of holding a static colour, have the browser send a target colour and let the ESP32 fade toward it over several `loop()` cycles. The animation runs on the device; the browser just sets the destination.

- **Combine with the main project** — when the pulse sensor detects a beat, have the ESP32 flash the NeoPixel white for 50 ms. BPM could also map to hue: a resting rate stays cool blue; an elevated rate shifts toward red.
