# Side Quest — Sending Data from the Browser to the ESP32

> **This is an optional extension.** It is not required for Smart Object Foundations. Come here when you want to go the other direction: instead of reading sensor data *out of* the ESP32, you will push data *into* it from the browser.

The main project treats the ESP32 as a source — it sends, the browser receives. This side quest reverses the pipe. The browser becomes the sender; the ESP32 listens and reacts.

The progression moves from the smallest possible interaction to a continuous real-time stream:

| Stage | What you send | ESP32 response |
|---|---|---|
| SQ-0 | A single trigger (button press) | Toggle an LED |
| SQ-1 | A text command | Parse and act on named instructions |
| SQ-2 | Browser events | React to mouse, keyboard, or device input |
| SQ-3 | A continuous stream | Follow a live data feed in real time |

---

## Before You Start

You need a working WebSerial connection from the main project. The same port object used to **read** from the ESP32 also has a `writable` side for sending data back.

The WebSerial write pattern looks like this:

```js
const writer = port.writable.getWriter();
const encoder = new TextEncoder();
await writer.write(encoder.encode("hello\n"));
writer.releaseLock(); // always release so other code can write later
```

On the Arduino side, reading what the browser sends looks like this:

```cpp
if (Serial.available()) {
  String msg = Serial.readStringUntil('\n');
  msg.trim(); // strip any trailing whitespace or \r
  // now use msg
}
```

Keep both of these patterns in mind — every stage in this side quest builds on them.

---

## SQ-0 — A Button That Does Something

The smallest possible interaction: one button in the browser, one LED on the ESP32.

**What you build:**
- A browser button labelled "Toggle LED"
- Clicking it sends `"1\n"` to the ESP32
- Releasing (or clicking again) sends `"0\n"`
- The ESP32 reads the value and sets the built-in LED high or low

**Arduino sketch — listen for `1` and `0`:**

```cpp
void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  if (Serial.available()) {
    String msg = Serial.readStringUntil('\n');
    msg.trim();
    if      (msg == "1") digitalWrite(LED_BUILTIN, HIGH);
    else if (msg == "0") digitalWrite(LED_BUILTIN, LOW);
  }
}
```

**p5.js sketch — send on button press:**

```js
let port, writer;

async function connectSerial() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
}

async function sendValue(val) {
  if (!port) return;
  const w = port.writable.getWriter();
  await w.write(new TextEncoder().encode(val + "\n"));
  w.releaseLock();
}

function setup() {
  createCanvas(300, 200);
  let connect = createButton("Connect ESP32");
  connect.mousePressed(connectSerial);

  let btn = createButton("Toggle LED");
  btn.mousePressed(() => sendValue("1"));
  btn.mouseReleased(() => sendValue("0"));
}

function draw() {
  background(30);
}
```

> **📐 Concept Sidebar: Bidirectional Serial**
>
> A serial connection is a **full-duplex pipe**: data can travel in both directions simultaneously. The WebSerial API exposes this as two separate streams: `port.readable` (bytes coming *from* the device) and `port.writable` (bytes going *to* the device). The main project only used `readable`. This stage introduces `writable`.
>
> The `getWriter()` / `releaseLock()` pattern is necessary because the writable stream can only have one active writer at a time. You acquire the writer, use it, and release it so another part of your code can write later. Forgetting `releaseLock()` is the most common mistake — it causes the next write to hang silently.

**Deliverable:** The LED on your ESP32 lights up while the browser button is held down.

---

## SQ-1 — Text Commands

A single `"1"` or `"0"` works for a boolean switch. Real applications need more expressive messages. In this stage you design a simple **command protocol** — structured text messages the ESP32 can parse and act on.

**What you build:**
- A browser text input and send button
- A small vocabulary of commands the ESP32 understands
- The ESP32 parses each command and responds differently

**Example command vocabulary:**

| Command string | ESP32 action |
|---|---|
| `LED:ON` | LED on |
| `LED:OFF` | LED off |
| `BLINK:3` | Blink 3 times |
| `BLINK:10` | Blink 10 times |

**Arduino sketch — parse named commands:**

```cpp
void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  if (Serial.available()) {
    String msg = Serial.readStringUntil('\n');
    msg.trim();

    if (msg == "LED:ON") {
      digitalWrite(LED_BUILTIN, HIGH);

    } else if (msg == "LED:OFF") {
      digitalWrite(LED_BUILTIN, LOW);

    } else if (msg.startsWith("BLINK:")) {
      int times = msg.substring(6).toInt(); // extract the number after the colon
      for (int i = 0; i < times; i++) {
        digitalWrite(LED_BUILTIN, HIGH); delay(150);
        digitalWrite(LED_BUILTIN, LOW);  delay(150);
      }
    }
  }
}
```

**p5.js sketch — text input + send:**

```js
let port;

async function connectSerial() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
}

async function sendCommand(cmd) {
  if (!port) return;
  const w = port.writable.getWriter();
  await w.write(new TextEncoder().encode(cmd + "\n"));
  w.releaseLock();
}

function setup() {
  createCanvas(400, 200);

  createButton("Connect").mousePressed(connectSerial);

  let input = createInput("LED:ON");
  let send  = createButton("Send");
  send.mousePressed(() => sendCommand(input.value()));
}

function draw() { background(30); }
```

> **📐 Concept Sidebar: Command Protocols**
>
> Anytime two systems communicate, they need to agree on a format. That agreement is a **protocol**. Even something as simple as `"LED:ON\n"` is a protocol: both sides know the delimiter (`\n`), the separator (`:`), and the vocabulary of valid commands.
>
> The colon-separated `COMMAND:VALUE` pattern used here is a minimal version of patterns you will see everywhere — HTTP headers (`Content-Type: text/html`), CSS properties (`color: red`), Arduino libraries like Firmata, and serial protocols like NMEA (GPS sentences). The structure is the same; only the vocabulary changes.
>
> **What makes a good command protocol for microcontrollers?**
> - Human-readable (you can see it in the Serial Monitor)
> - Newline-delimited (easy to read with `readStringUntil('\n')`)
> - Compact (microcontrollers have small buffers)
> - Unambiguous (no command is a prefix of another)

**Deliverable:** You can type `BLINK:5` into the browser and watch the LED blink five times.

---

## SQ-2 — Browser Events

Instead of typing commands manually, you can wire browser events directly to the ESP32. Mouse position, keyboard keys, device orientation, slider values — any event the browser can detect can become a signal the ESP32 reacts to.

**What you build:**
- Map the mouse X position (0 → canvas width) to a PWM brightness value (0 → 255)
- Send the value to the ESP32 on every mouse move
- ESP32 drives the built-in LED at that brightness with `analogWrite()`

**Arduino sketch — receive a brightness value:**

```cpp
void setup() {
  Serial.begin(115200);
  // LED_BUILTIN on most ESP32 boards supports PWM
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  if (Serial.available()) {
    String msg = Serial.readStringUntil('\n');
    msg.trim();
    int brightness = msg.toInt(); // expects a number 0–255
    analogWrite(LED_BUILTIN, brightness);
  }
}
```

**p5.js sketch — mouse controls LED brightness:**

```js
let port;
let lastSent = -1; // avoid sending the same value twice in a row

async function connectSerial() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
}

async function sendValue(val) {
  if (!port) return;
  const w = port.writable.getWriter();
  await w.write(new TextEncoder().encode(val + "\n"));
  w.releaseLock();
}

function setup() {
  createCanvas(400, 200);
  createButton("Connect").mousePressed(connectSerial);
}

function draw() {
  background(30);

  // Map mouse X to brightness 0–255
  let brightness = floor(map(mouseX, 0, width, 0, 255));
  brightness = constrain(brightness, 0, 255);

  // Only send when the value changes
  if (brightness !== lastSent) {
    sendValue(brightness);
    lastSent = brightness;
  }

  // Visual feedback in the browser
  fill(brightness);
  noStroke();
  ellipse(width / 2, height / 2, 80, 80);
}
```

> **📐 Concept Sidebar: Event-Driven Input and Latency**
>
> Browser events (mousemove, keydown, deviceorientation) fire asynchronously — they arrive whenever they happen, not on a fixed schedule. The ESP32's serial buffer is small (typically 64–256 bytes). If events fire faster than the ESP32 consumes them, the buffer fills up and older messages are dropped or delayed.
>
> Two strategies help:
>
> - **Send only on change** — compare the new value to the last sent value; skip the write if they are the same. This sketch uses `lastSent` for exactly this.
> - **Throttle** — enforce a minimum interval between sends, for example using `millis()` in p5 to gate sends to no more than once every 20 ms (50 Hz). This is a good strategy for continuous data like mouse position.
>
> The ESP32 processes one `readStringUntil('\n')` call per `loop()` iteration. Keep messages short (a number, not a paragraph) and keep the send rate within what the device can consume.

**Deliverable:** Moving the mouse left to right smoothly dims and brightens the LED in real time.

---

## SQ-3 — A Continuous Stream

The previous stages sent data in response to user actions. A stream sends data continuously — the browser generates a value on a fixed schedule and the ESP32 responds in real time. This is the clearest parallel to the main project (which streams *from* the ESP32), just running in reverse.

**What you build:**
- A browser slider that controls a target value (0–180, suitable for a servo angle)
- A fixed-rate send loop that transmits the current slider value at 20 Hz
- An ESP32 sketch that moves a servo to the received angle

**Hardware:** connect a servo signal wire to pin 18 (or any PWM-capable pin), power to 5V, ground to GND.

**Arduino sketch — drive a servo from the stream:**

```cpp
#include <ESP32Servo.h> // install via Library Manager

Servo myServo;

void setup() {
  Serial.begin(115200);
  myServo.attach(18);
}

void loop() {
  if (Serial.available()) {
    String msg = Serial.readStringUntil('\n');
    msg.trim();
    int angle = msg.toInt();
    angle = constrain(angle, 0, 180);
    myServo.write(angle);
  }
}
```

**p5.js sketch — slider streams at 20 Hz:**

```js
let port;
let slider;

async function connectSerial() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
}

async function sendAngle(angle) {
  if (!port) return;
  const w = port.writable.getWriter();
  await w.write(new TextEncoder().encode(floor(angle) + "\n"));
  w.releaseLock();
}

function setup() {
  createCanvas(400, 200);
  createButton("Connect").mousePressed(connectSerial);

  slider = createSlider(0, 180, 90);
  slider.size(300);

  // Send at a fixed 20 Hz regardless of how fast the slider moves
  setInterval(() => sendAngle(slider.value()), 50);
}

function draw() {
  background(30);
  fill(255);
  noStroke();
  textSize(24);
  textAlign(CENTER);
  text(`${slider.value()}°`, width / 2, height / 2);
}
```

> **📐 Concept Sidebar: Throttling and Backpressure**
>
> A slider's `input` event can fire dozens of times per second on a fast mouse. Sending every event would flood the ESP32's serial buffer. `setInterval(..., 50)` decouples the *sending rate* from the *event rate*: it samples the current slider value at a fixed 20 Hz and sends that, regardless of how rapidly the slider is moving.
>
> This is **throttling** — enforcing a maximum send rate. It is different from **debouncing** (waiting for activity to stop before acting). For continuous control of a physical output like a servo, throttling is the right choice: you want regular, evenly-spaced updates, not a burst followed by silence.
>
> The broader concept is **backpressure**: what happens when a producer generates data faster than a consumer can process it. The WebSerial `writable` stream has built-in backpressure signalling, but for short bursts at 20 Hz you won't hit it. If you were streaming audio or image data, you would need to monitor `writer.desiredSize` and pause the producer when the buffer fills.
>
> **The full picture:** the main project streams at 100 Hz *from* ESP32 *to* browser. This stage streams at 20 Hz *from* browser *to* ESP32. The hardware serial link supports both simultaneously — one direction does not block the other.

**Deliverable:** Moving the slider sweeps the servo across its full range smoothly. Releasing the slider holds the servo at the last angle.

---

## Where to Go Next

These four stages open up a class of projects that the main pipeline does not cover — the ESP32 as a **receiver and actuator**, not just a sensor.

Some directions worth exploring:

- **Bidirectional loop** — combine the main project with this side quest: the ESP32 reads the pulse sensor and sends BPM to the browser, and the browser sends a haptic motor command back when BPM exceeds a threshold.
- **Fetch a web API** — replace the slider with a live data source (weather, a public API, a shared database) and stream the value to the ESP32. The ESP32 becomes a physical display for web data.
- **Multi-channel commands** — extend the command protocol from SQ-1 to control several outputs independently: `CH1:120`, `CH2:45`, `CH3:200` — one message per channel, parsed on the ESP32.
- **Confirmed commands** — have the ESP32 echo back what it received (`Serial.println("OK:" + msg)`), and have the browser parse the acknowledgement. This closes the feedback loop and lets you detect dropped messages.
