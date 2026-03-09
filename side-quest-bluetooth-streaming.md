# Side Quest — Wireless Data Streaming over Bluetooth LE

> **This is an optional extension.** It is not required for Smart Object Foundations. Come here when you want to cut the USB cable and stream sensor data wirelessly from your ESP32 to the browser using Bluetooth Low Energy (BLE).

The main project streams pulse sensor data over USB serial using WebSerial. This side quest keeps the same signal but replaces the wire with a BLE radio link. The ESP32 advertises a standard BLE serial service; the browser connects through the Web Bluetooth API — no cable, no drivers, no configuration beyond clicking a button.

```
fingertip → PulseSensor → ESP32 analogRead()
                                    ↓
                              BLE notification
                                    ↓
                         Web Bluetooth API (Chrome / Edge)
                                    ↓
                              p5.js visualization
```

The progression matches the structure of the main project's stages:

| Stage | What you build | New skill |
|---|---|---|
| SQ-0 | ESP32 advertises a BLE service | BLE on ESP32 |
| SQ-1 | ESP32 streams sensor data over BLE | BLE notifications |
| SQ-2 | Browser connects and receives the stream | Web Bluetooth API |
| SQ-3 | Browser sends commands back to the ESP32 | Bidirectional BLE |

---

## What You Need

**Hardware (same as the main project):**
- Adafruit ESP32 v2 Feather
- PulseSensor (red, black, purple wires)

**Software:**
- Chrome or Edge — the same browsers that support WebSerial. Firefox does not support the Web Bluetooth API.
- **nRF Connect** — a free app by Nordic Semiconductor. Install it on your phone (iOS or Android). You will use it in SQ-0 and SQ-1 to inspect BLE data without writing any browser code yet.

**Arduino libraries** — all of the BLE libraries used in this side quest ship with the ESP32 board package. No separate install is needed:

| Library | What it provides |
|---|---|
| `BLEDevice.h` | Global BLE initialisation |
| `BLEServer.h` | ESP32 acting as a BLE peripheral (server) |
| `BLEUtils.h` | UUID helpers and utility types |
| `BLE2902.h` | The Client Characteristic Configuration Descriptor (CCCD) — required for notifications |

---

## The Nordic UART Service (NUS)

All four stages in this side quest use the **Nordic UART Service (NUS)**, a widely-adopted BLE convention for emulating a serial port wirelessly. It defines two characteristics inside one service:

| Role | UUID | Direction |
|---|---|---|
| Service | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` | — |
| TX (ESP32 → browser) | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` | notify |
| RX (browser → ESP32) | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` | write |

The TX characteristic sends data from the ESP32 to the browser via **notifications** — the ESP32 pushes a packet each time it has new data, without the browser polling. The RX characteristic receives data written by the browser.

These UUIDs are recognised by nRF Connect and by most BLE serial apps, which makes debugging straightforward. Copy the constants below into every sketch in this side quest — they never change.

```cpp
#define SERVICE_UUID        "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_TX   "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_RX   "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
```

---

## SQ-0 — BLE Advertisement

Before streaming any data, verify that the ESP32 can advertise a BLE service and that your phone can see it. No sensor reading happens here — this is purely a network connectivity check.

**What you build:**
- ESP32 starts up, initialises BLE, and begins advertising under the name `"PulseSensor"`
- The Serial Monitor prints a ready message
- nRF Connect on your phone finds the device and shows the NUS service

**Arduino sketch:**

```cpp
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID      "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"

BLEServer*         bleServer  = nullptr;
BLECharacteristic* txChar     = nullptr;
BLECharacteristic* rxChar     = nullptr;
bool               connected  = false;

// Called automatically when a BLE central connects or disconnects
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*)    override { connected = true;  Serial.println("BLE client connected."); }
  void onDisconnect(BLEServer*) override {
    connected = false;
    Serial.println("BLE client disconnected — restarting advertising.");
    BLEDevice::startAdvertising(); // restart so the device is discoverable again
  }
};

void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialise the BLE stack and give the device a human-readable name.
  // This name appears in the scan list on nRF Connect and in the browser picker.
  BLEDevice::init("PulseSensor");

  // Create the server and attach connection callbacks.
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  // Create the Nordic UART Service.
  BLEService* service = bleServer->createService(SERVICE_UUID);

  // TX characteristic — the ESP32 writes here; the browser reads via notifications.
  txChar = service->createCharacteristic(
    CHARACTERISTIC_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  txChar->addDescriptor(new BLE2902()); // required for notifications to work

  // RX characteristic — the browser writes here; the ESP32 reads it.
  rxChar = service->createCharacteristic(
    CHARACTERISTIC_RX,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );

  // Start the service and begin advertising.
  service->start();
  BLEDevice::startAdvertising();

  Serial.println("BLE advertising as \"PulseSensor\". Open nRF Connect to verify.");
}

void loop() {
  // Nothing to do yet — just keep advertising.
  delay(1000);
}
```

**How to verify with nRF Connect:**

1. Open nRF Connect on your phone.
2. Tap **Scan**.
3. Look for a device named **PulseSensor** in the list.
4. Tap **Connect**.
5. Expand the **Nordic UART Service** entry — you should see both the TX and RX characteristics with their UUIDs.

> **📐 Concept Sidebar: BLE Roles and GATT**
>
> Bluetooth Low Energy uses the **Generic Attribute Profile (GATT)** to organise data. A **peripheral** (here, the ESP32) acts as a *server*: it hosts a hierarchy of services and characteristics. A **central** (the phone or browser) acts as a *client*: it connects to the server and reads, writes, or subscribes to its characteristics.
>
> A **service** is a logical grouping — think of it as a category. A **characteristic** is a single data point inside that service, with a type (UUID), a value, and a set of permissions (read, write, notify). The **BLE2902 descriptor** attached to the TX characteristic is the on/off switch for notifications: without it, the client cannot enable notify mode, and data will never arrive.
>
> Advertising is how a peripheral announces its presence. The packet is tiny (31 bytes maximum) and repeats every few hundred milliseconds. A central scans for these packets to build its device list. Once connected, advertising stops — the ESP32 is visible to only one central at a time with this configuration. Restarting advertising in `onDisconnect` makes the device discoverable again after the client disconnects.

**Deliverable:** nRF Connect shows `PulseSensor` in the scan list, connects successfully, and displays the Nordic UART Service with its two characteristics.

---

## SQ-1 — Stream Sensor Data over BLE

Add the pulse sensor and start sending readings wirelessly. The structure is the same non-blocking timer pattern used in the main project — a reading every 10 ms at 100 Hz — but the output goes to the BLE TX characteristic instead of `Serial.println()`.

**Hardware connections** (same as the main project):

| PulseSensor wire | ESP32 v2 pin |
|---|---|
| Red (power) | 3.3V |
| Black (ground) | GND |
| Purple (signal) | A0 |

**Arduino sketch:**

```cpp
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID      "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"

const int          SENSOR_PIN          = A0;
const unsigned long SAMPLE_INTERVAL_MS = 10; // 100 Hz

BLEServer*         bleServer  = nullptr;
BLECharacteristic* txChar     = nullptr;
BLECharacteristic* rxChar     = nullptr;
bool               connected  = false;
unsigned long      lastSample = 0;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*)    override { connected = true;  Serial.println("Connected."); }
  void onDisconnect(BLEServer*) override {
    connected = false;
    Serial.println("Disconnected — restarting advertising.");
    BLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);
  delay(500);

  BLEDevice::init("PulseSensor");

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  BLEService* service = bleServer->createService(SERVICE_UUID);

  txChar = service->createCharacteristic(
    CHARACTERISTIC_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  txChar->addDescriptor(new BLE2902());

  rxChar = service->createCharacteristic(
    CHARACTERISTIC_RX,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );

  service->start();
  BLEDevice::startAdvertising();
  Serial.println("Advertising. Connect with nRF Connect to see sensor values.");
}

void loop() {
  unsigned long now = millis();

  if (now - lastSample >= SAMPLE_INTERVAL_MS) {
    lastSample = now;

    int rawValue = analogRead(SENSOR_PIN);

    // Always log to Serial for debugging in the Arduino IDE.
    Serial.println(rawValue);

    // Only send over BLE if a central is connected — calling setValue / notify
    // with no connection wastes time and can cause errors.
    if (connected) {
      // Format the reading as "timestamp,value\n" — the same format the
      // p5.js sketch already knows how to parse from the main project.
      String line = String(now) + "," + String(rawValue) + "\n";
      txChar->setValue(line.c_str());
      txChar->notify();
    }
  }
}
```

**How to verify with nRF Connect:**

1. Connect to **PulseSensor** in nRF Connect.
2. Find the TX characteristic (UUID ending `...03`).
3. Tap the **notify** (subscribe) button (the triple-arrow icon).
4. Place your fingertip on the PulseSensor.
5. The characteristic value updates roughly 10 times per second. You should see numbers in the 1000–3500 range that fluctuate as your blood flow changes.

> **📐 Concept Sidebar: BLE Notifications and MTU**
>
> A BLE **notification** is a packet the peripheral sends to the central without being asked — it is the BLE equivalent of `Serial.println()`. The central subscribes to notifications by writing a `1` to the BLE2902 descriptor (the Client Characteristic Configuration Descriptor). After that, every call to `txChar->notify()` on the ESP32 sends a packet to the connected central.
>
> BLE packets have a maximum size called the **MTU (Maximum Transmission Unit)**. The default MTU is 23 bytes; after connection the central and peripheral negotiate a larger size (typically 247 bytes on modern phones and Chrome). A line like `"24530,2183\n"` is 11 bytes — well within the default MTU, so each reading fits comfortably in a single packet.
>
> At 100 Hz (one notification every 10 ms), the data rate is roughly 1 KB/s — easily within BLE's ~125 KB/s capacity for short bursts. If you needed to stream multiple channels or raw audio, you would need to pack more data per packet and stay conscious of the MTU.

**Deliverable:** nRF Connect shows live, changing values from the TX characteristic when your fingertip is on the sensor.

---

## SQ-2 — Web Bluetooth in the Browser

Now connect the browser to the ESP32 using the **Web Bluetooth API** — the wireless counterpart to WebSerial. The p5.js sketch scans for `PulseSensor`, connects, subscribes to TX notifications, and plots the incoming values on a scrolling graph.

No hardware changes are needed. The Arduino sketch from SQ-1 runs unchanged.

> **Browser note:** The Web Bluetooth API requires a **secure context** (HTTPS or localhost) and is supported in Chrome and Edge. It is not available in Firefox or Safari. The same browsers you used for WebSerial in the main project will work here.

**p5.js sketch (`sketch.js`):**

```js
// ─── BLE UUIDs (must match the ESP32 sketch exactly) ─────────────────────────
const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

// ─── State ────────────────────────────────────────────────────────────────────
let bleDevice    = null;
let txChar       = null;
let connected    = false;

const HISTORY    = 300;          // number of samples shown on the graph
const values     = new Array(HISTORY).fill(2048); // pre-fill at ADC midpoint

// ─── BLE connection ───────────────────────────────────────────────────────────
async function connectBLE() {
  try {
    // requestDevice() opens the browser's device picker. The filter ensures
    // only devices advertising the NUS service appear in the list.
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
    });

    bleDevice.addEventListener("gattserverdisconnected", onDisconnect);

    const server  = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    txChar        = await service.getCharacteristic(TX_CHAR_UUID);

    // Subscribe to notifications — equivalent to enabling notify in nRF Connect.
    await txChar.startNotifications();
    txChar.addEventListener("characteristicvaluechanged", onData);

    connected = true;
    console.log("BLE connected to", bleDevice.name);
  } catch (err) {
    console.error("BLE connection failed:", err);
  }
}

function onDisconnect() {
  connected = false;
  txChar    = null;
  console.log("BLE disconnected.");
}

// ─── Data handler ─────────────────────────────────────────────────────────────
function onData(event) {
  // event.target.value is a DataView — decode it to a string first.
  const text = new TextDecoder().decode(event.target.value);

  // The ESP32 sends "timestamp,rawValue\n" — split on the comma.
  const parts = text.trim().split(",");
  if (parts.length < 2) return;

  const raw = parseInt(parts[1], 10);
  if (isNaN(raw)) return;

  values.push(raw);
  if (values.length > HISTORY) values.shift(); // keep the array at fixed length
}

// ─── p5.js sketch ─────────────────────────────────────────────────────────────
function setup() {
  createCanvas(800, 300);

  let btn = createButton(connected ? "Disconnect" : "Connect ESP32 via BLE");
  btn.mousePressed(connectBLE);
}

function draw() {
  background(30);

  // Status indicator
  fill(connected ? color(0, 200, 100) : color(180));
  noStroke();
  ellipse(20, 20, 12, 12);
  fill(255);
  textSize(13);
  text(connected ? "BLE connected" : "not connected", 30, 25);

  // Scrolling waveform — map ADC range (0–4095) to canvas height
  stroke(0, 180, 255);
  strokeWeight(1.5);
  noFill();
  beginShape();
  for (let i = 0; i < values.length; i++) {
    let x = map(i, 0, values.length - 1, 0, width);
    let y = map(values[i], 0, 4095, height - 10, 10);
    vertex(x, y);
  }
  endShape();
}
```

**`index.html`:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>BLE Pulse Sensor</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
</head>
<body style="background:#1e1e1e; margin:0;">
  <script src="sketch.js"></script>
</body>
</html>
```

**How to run:**

1. Upload the SQ-1 Arduino sketch to the ESP32.
2. Open `index.html` in Chrome or Edge (from a local folder or localhost — not the file:// protocol on some systems; use a simple local server such as `python3 -m http.server` and open `http://localhost:8000`).
3. Click **Connect ESP32 via BLE**.
4. The browser device picker opens — select **PulseSensor**.
5. Place your fingertip on the sensor and watch the waveform scroll.

> **📐 Concept Sidebar: Web Bluetooth vs. WebSerial**
>
> WebSerial and the Web Bluetooth API solve the same problem — getting sensor data into the browser — but through very different transports:
>
> | | WebSerial | Web Bluetooth |
> |---|---|---|
> | Transport | USB cable | BLE radio |
> | Browser support | Chrome, Edge | Chrome, Edge |
> | Range | ~1–2 m (cable length) | ~10 m typical |
> | Latency | < 1 ms | 7–15 ms typical |
> | Throughput | ~1 MB/s (115200 baud ≈ 14 KB/s effective) | ~60–125 KB/s |
> | Pairing | None — plug in and connect | Click-to-pair device picker |
> | Power (ESP32) | USB-powered | Battery-viable |
>
> For a wearable or portable prototype — a pulse sensor on your wrist, an accelerometer in a prop, a sensor in clothing — BLE is the natural choice. For desk development and debugging, WebSerial is simpler: no pairing, no radio interference, higher throughput.
>
> The Web Bluetooth `requestDevice()` filter on `services: [SERVICE_UUID]` ensures the picker only shows devices that advertise the NUS service, so the user does not have to know the device's name.

**Deliverable:** The browser waveform display updates wirelessly in real time, matching the waveform you see in the Arduino IDE Serial Plotter.

---

## SQ-3 — Bidirectional BLE

The TX characteristic streams data from the ESP32 to the browser. The RX characteristic goes in the opposite direction: the browser writes a command, the ESP32 reads it and reacts.

This stage adds two capabilities:
- A browser button that sends `"PAUSE\n"` and `"RESUME\n"` to toggle streaming on and off
- The ESP32 parses incoming RX data and acts on it

**Arduino sketch** (extends SQ-1):

```cpp
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID      "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"

const int          SENSOR_PIN          = A0;
const unsigned long SAMPLE_INTERVAL_MS = 10;

BLEServer*         bleServer  = nullptr;
BLECharacteristic* txChar     = nullptr;
BLECharacteristic* rxChar     = nullptr;
bool               connected  = false;
bool               streaming  = true;  // can be paused by the browser
unsigned long      lastSample = 0;

// Called when the browser writes a value to the RX characteristic
class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pChar) override {
    String msg = pChar->getValue().c_str();
    msg.trim();
    Serial.println("RX received: " + msg);

    if      (msg == "PAUSE")  { streaming = false; Serial.println("Streaming paused."); }
    else if (msg == "RESUME") { streaming = true;  Serial.println("Streaming resumed."); }
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*)    override { connected = true;  Serial.println("Connected."); }
  void onDisconnect(BLEServer*) override {
    connected = false;
    streaming = true; // reset to streaming when disconnected
    Serial.println("Disconnected — restarting advertising.");
    BLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  delay(500);

  BLEDevice::init("PulseSensor");

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  BLEService* service = bleServer->createService(SERVICE_UUID);

  txChar = service->createCharacteristic(
    CHARACTERISTIC_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  txChar->addDescriptor(new BLE2902());

  rxChar = service->createCharacteristic(
    CHARACTERISTIC_RX,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  rxChar->setCallbacks(new RxCallbacks()); // attach the write callback

  service->start();
  BLEDevice::startAdvertising();
  Serial.println("Advertising. Waiting for connection.");
}

void loop() {
  unsigned long now = millis();

  if (now - lastSample >= SAMPLE_INTERVAL_MS) {
    lastSample = now;

    int rawValue = analogRead(SENSOR_PIN);
    Serial.println(rawValue);

    if (connected && streaming) {
      String line = String(now) + "," + String(rawValue) + "\n";
      txChar->setValue(line.c_str());
      txChar->notify();
      digitalWrite(LED_BUILTIN, HIGH); // LED on while streaming
    } else {
      digitalWrite(LED_BUILTIN, LOW);  // LED off when paused or disconnected
    }
  }
}
```

**p5.js sketch** (extends SQ-2 — adds RX write support):

```js
const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

let bleDevice = null;
let txChar    = null;
let rxChar    = null;
let connected = false;
let paused    = false;

const HISTORY = 300;
const values  = new Array(HISTORY).fill(2048);

async function connectBLE() {
  try {
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
    });
    bleDevice.addEventListener("gattserverdisconnected", onDisconnect);

    const server  = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    txChar = await service.getCharacteristic(TX_CHAR_UUID);
    await txChar.startNotifications();
    txChar.addEventListener("characteristicvaluechanged", onData);

    rxChar = await service.getCharacteristic(RX_CHAR_UUID); // grab the RX char too

    connected = true;
  } catch (err) {
    console.error("BLE connect error:", err);
  }
}

function onDisconnect() {
  connected = false;
  paused    = false;
  txChar    = null;
  rxChar    = null;
}

async function sendCommand(cmd) {
  if (!rxChar) return;
  await rxChar.writeValueWithoutResponse(new TextEncoder().encode(cmd + "\n"));
}

function onData(event) {
  const text  = new TextDecoder().decode(event.target.value);
  const parts = text.trim().split(",");
  if (parts.length < 2) return;

  const raw = parseInt(parts[1], 10);
  if (isNaN(raw)) return;

  values.push(raw);
  if (values.length > HISTORY) values.shift();
}

// ─── p5.js ────────────────────────────────────────────────────────────────────
let connectBtn, pauseBtn;

function setup() {
  createCanvas(800, 320);

  connectBtn = createButton("Connect ESP32 via BLE");
  connectBtn.mousePressed(connectBLE);

  pauseBtn = createButton("Pause");
  pauseBtn.mousePressed(togglePause);
}

function togglePause() {
  if (!connected) return;
  paused = !paused;
  sendCommand(paused ? "PAUSE" : "RESUME");
  pauseBtn.html(paused ? "Resume" : "Pause");
}

function draw() {
  background(30);

  // Status
  fill(connected ? (paused ? color(255, 180, 0) : color(0, 200, 100)) : color(180));
  noStroke();
  ellipse(20, 20, 12, 12);
  fill(255);
  textSize(13);
  text(
    connected ? (paused ? "paused" : "streaming") : "not connected",
    30, 25
  );

  // Waveform
  stroke(0, 180, 255);
  strokeWeight(1.5);
  noFill();
  beginShape();
  for (let i = 0; i < values.length; i++) {
    let x = map(i, 0, values.length - 1, 0, width);
    let y = map(values[i], 0, 4095, height - 10, 10);
    vertex(x, y);
  }
  endShape();
}
```

> **📐 Concept Sidebar: WRITE vs. WRITE WITHOUT RESPONSE**
>
> BLE defines two ways to write a value to a characteristic:
>
> - **WRITE** — the peripheral sends an acknowledgement packet back. The write is confirmed; if the packet is lost, the stack retries. Slightly higher latency.
> - **WRITE WITHOUT RESPONSE** (`WRITE_NR`) — no acknowledgement is sent. Lower latency, but you have no confirmation the packet arrived.
>
> The ESP32 sketch registers both (`PROPERTY_WRITE | PROPERTY_WRITE_NR`) to accept either. The browser uses `writeValueWithoutResponse()`, which is the lower-latency path and the preferred choice for command-style messages at low rates.
>
> The `BLECharacteristicCallbacks::onWrite()` method fires on the ESP32 whenever a write arrives, regardless of which write mode the central used. Inside `onWrite()`, `pChar->getValue()` returns the current value as a `std::string`, which the Arduino `String` constructor can accept directly.

**Deliverable:** Clicking **Pause** in the browser stops the BLE notifications and turns off the built-in LED on the ESP32. Clicking **Resume** restarts streaming. The Serial Monitor on the ESP32 logs `"RX received: PAUSE"` and `"RX received: RESUME"` as each command arrives.

---

## Where to Go Next

- **Wearable prototype** — because there is no USB cable, the ESP32 can run on a LiPo battery using the Feather's built-in charger circuit. Tape the sensor to a fingertip and stream BPM to a phone.

- **Multiple sensors** — the NUS protocol carries arbitrary text. Add a second sensor (accelerometer, temperature) and send both readings on the same line: `"24530,2183,512\n"`. The browser splits on commas to get all three values.

- **Combine with the main project** — swap the WebSerial connection logic in the Stage 2 and Stage 3 p5.js sketches for the BLE connection logic here. The signal processing (background subtraction, smoothing, peak detection) is transport-agnostic — the data arrives as the same `timestamp,value` string either way.

- **BLE to mobile** — React Native and Flutter both have BLE libraries that speak the same NUS UUIDs. A phone app built on either framework connects to the same ESP32 sketch without any changes to the firmware.

- **Secure pairing** — for a project that handles sensitive biometric data, look into BLE bonding (`BLEDevice::setEncryptionLevel()` and `BLEDevice::setSecurityAuth()`). Bonded devices exchange keys at first pairing and authenticate automatically on subsequent connections.
