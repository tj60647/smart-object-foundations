# Side Quest — AI-Generated Haptic Patterns over WiFi

> **This is an optional extension.** It is not required for Smart Object Foundations. Come here when you want to close the loop between the cloud and the body — pressing a physical button on the ESP32 asks an AI to design a vibration pattern, which plays back on the haptic motor you used in Human Augmentation.

This side quest reunites hardware from two projects and adds one new skill to each: **WiFi networking on the ESP32** and **calling the Claude API from a serverless cloud function**.

```
[BOOT button pressed on ESP32]
        ↓
   ESP32 makes an HTTP GET over WiFi
        ↓
   Vercel serverless function receives the request
        ↓
   Function calls Claude API: "design a haptic pattern"
        ↓
   Claude returns structured JSON
        ↓
   Vercel returns the JSON to the ESP32
        ↓
   ESP32 parses the JSON
        ↓   (StemmaQT cable)
   DRV2605L haptic driver plays each effect
        ↓
   Vibration motor
```

Compared to the [main project](./README.md) (ESP32 → browser) and the [browser-to-ESP32 side quest](./side-quest-browser-to-esp32.md) (browser → ESP32 via USB), this path goes through the cloud. The ESP32 is no longer tethered to a USB cable — it acts autonomously.

| Stage | What you build | New skill |
|---|---|---|
| SQ-0 | ESP32 connects to WiFi and makes an HTTP GET | WiFi on ESP32 |
| SQ-1 | Play a hardcoded pattern on the DRV2605L | Refresher from Human Augmentation |
| SQ-2 | Deploy a Vercel function that calls Claude | Serverless functions + Claude API |
| SQ-3 | Full loop: button → WiFi → Claude → motor | Everything connected |

---

## What You Need

**Hardware (all from Human Augmentation):**
- Adafruit ESP32 v2 Feather
- Adafruit DRV2605L haptic driver breakout
- StemmaQT / Qwiic cable
- ERM vibration motor (connected to the DRV2605L terminals)

**Accounts and tools:**
- [Vercel](https://vercel.com) — free tier is enough
- [Anthropic Console](https://console.anthropic.com) — create an account and generate an API key
- Node.js installed on your computer (for the Vercel CLI)
- Vercel CLI: `npm install -g vercel`

> **On API cost:** The Vercel function uses Claude Haiku, the fastest and most affordable Claude model. Each haptic pattern request costs roughly $0.0002–0.0005. Pressing the button 50 times in a session costs less than a cent.

**Arduino libraries** — install these in the Library Manager before starting:

| Library | Search term |
|---|---|
| Adafruit DRV2605 Library | `DRV2605` |
| ArduinoJson | `ArduinoJson` (by Benoit Blanchon) |

`WiFi.h` and `HTTPClient.h` come bundled with the ESP32 board package — no separate install needed.

---

## Credentials File

Create a file called `secrets.h` in the same folder as your Arduino sketch. **Never commit this file to git** — it contains your WiFi password and the URL of your cloud function.

```cpp
// secrets.h — add this filename to your .gitignore

#define WIFI_SSID     "your-network-name"
#define WIFI_PASSWORD "your-network-password"
#define HAPTIC_URL    "https://your-project.vercel.app/api/haptic"
```

Add `secrets.h` to your `.gitignore`:

```
secrets.h
.env
.env.local
node_modules/
```

> **At CCA:** The campus WiFi requires a browser-based registration step that the ESP32 cannot complete. Use a **personal mobile hotspot** instead — on iPhone: Settings → Personal Hotspot; on Android: Settings → Hotspot and Tethering. The ESP32 radio only supports 2.4 GHz, so make sure your hotspot is broadcasting on that band (or set to "auto").

---

## SQ-0 — WiFi Connection

Before adding any cloud function or haptic motor, verify that your ESP32 can connect to WiFi and make an HTTP request. This stage is entirely about the network — no motor involved.

**What you build:**
- ESP32 connects to your hotspot on boot
- Makes a GET request to a public test URL
- Prints the response body to the Serial Monitor

**Arduino sketch:**

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

#include "secrets.h"

void setup() {
  Serial.begin(115200);
  delay(500);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected. IP: " + WiFi.localIP().toString());

  // Make a test GET request to a public echo service
  HTTPClient http;
  http.begin("https://httpbin.org/get");
  int code = http.GET();
  Serial.println("Response code: " + String(code));
  if (code == 200) {
    Serial.println(http.getString());
  }
  http.end();
}

void loop() {}
```

> **📐 Concept Sidebar: WiFi on the ESP32**
>
> The ESP32 has a built-in 2.4 GHz WiFi radio managed by the `WiFi` library. `WiFi.begin()` starts the association process; the `while (!WL_CONNECTED)` loop polls until the radio has an IP address. This typically takes 2–5 seconds.
>
> The polling loop blocks the main thread — for this project that is fine. For a production device you would register a callback with `WiFi.onEvent()` instead of polling.
>
> The `HTTPClient` library handles the TCP connection, HTTP request formatting, and response reading. `http.begin(url)` opens the connection; `http.GET()` sends the request and returns the HTTP status code; `http.getString()` reads the body. Always call `http.end()` to release the socket.

**Deliverable:** The Serial Monitor prints your ESP32's IP address and a JSON response from `httpbin.org`.

---

## SQ-1 — Play a Pattern on the DRV2605L

Before wiring in the network call, verify your DRV2605L is working. You used this driver in Human Augmentation — this stage is a quick hardware refresh and library check.

**Wiring:**

Connect a StemmaQT cable between the ESP32 Feather and the DRV2605L breakout. Both boards have StemmaQT connectors; the cable provides power and I²C with no individual wires needed.

If wiring by hand:

```
DRV2605L SDA  → ESP32 SDA
DRV2605L SCL  → ESP32 SCL
DRV2605L VIN  → 3.3V
DRV2605L GND  → GND
```

The ERM motor connects to the two screw terminals on the DRV2605L breakout.

**Arduino sketch — play three effects in sequence:**

```cpp
#include <Wire.h>
#include <Adafruit_DRV2605.h>

Adafruit_DRV2605 drv;

void playEffect(uint8_t effectId, int pauseMs) {
  drv.setWaveform(0, effectId); // load effect into slot 0
  drv.setWaveform(1, 0);        // terminate the sequence
  drv.go();                     // fire it
  delay(pauseMs);               // wait for the effect + gap before next
}

void setup() {
  Serial.begin(115200);
  Wire.begin();

  if (!drv.begin()) {
    Serial.println("DRV2605L not found — check wiring and StemmaQT cable");
    while (1);
  }

  drv.selectLibrary(1);
  drv.setMode(DRV2605_MODE_INTTRIG);
  Serial.println("DRV2605L ready");

  delay(1000);
  playEffect(1,  300);  // Strong click
  playEffect(7,  400);  // Soft bump
  playEffect(12, 300);  // Triple click
  Serial.println("Pattern complete");
}

void loop() {}
```

> **📐 Concept Sidebar: The DRV2605L Effect Library**
>
> The DRV2605L chip contains 123 pre-engineered waveform effects stored in ROM. Each effect is a precisely shaped sequence of motor drive voltages, designed to produce a specific tactile sensation. `setWaveform(0, 14)` loads effect 14 into slot 0 of an 8-slot sequencer; `go()` fires the sequence and the chip handles timing.
>
> A selection of effects relevant to this project:
>
> | ID | Sensation |
> |---|---|
> | 1 | Strong click |
> | 4 | Sharp click |
> | 7 | Soft bump |
> | 10 | Double click |
> | 12 | Triple click |
> | 14 | Strong buzz (short) |
> | 15 | Alert buzz (750 ms) |
> | 24 | Sharp tick |
> | 27 | Short double strong click |
> | 33 | Short double bright tick |
> | 48 | Smooth hum (gentle, continuous) |
>
> These are the same IDs Claude will use when designing patterns. The full list of 123 effects is in the [DRV2605L datasheet, section 11.2](https://www.ti.com/lit/ds/symlink/drv2605l.pdf).

**Deliverable:** The motor plays three distinct tactile sensations with gaps between them.

---

## SQ-2 — The Cloud Function

The cloud function is the bridge between the ESP32 and Claude. It receives a mood string as a query parameter, calls the Claude API, and returns a haptic pattern as JSON.

You will deploy this to **Vercel**, which handles hosting, HTTPS, and the Node.js runtime. The Anthropic API key lives in Vercel's environment variable store — it never appears in your code or on the ESP32.

**Create the project:**

```bash
mkdir haptic-api
cd haptic-api
npm init -y
npm install @anthropic-ai/sdk
mkdir api
```

**Create `api/haptic.js`:**

```js
const Anthropic = require("@anthropic-ai/sdk");

// The effect IDs Claude is allowed to use, with descriptions it can reason about
const EFFECTS = [
  { id: 1,  label: "Strong click" },
  { id: 4,  label: "Sharp click" },
  { id: 7,  label: "Soft bump" },
  { id: 10, label: "Double click" },
  { id: 12, label: "Triple click" },
  { id: 14, label: "Strong buzz" },
  { id: 15, label: "Alert buzz 750ms" },
  { id: 24, label: "Sharp tick" },
  { id: 27, label: "Short double strong click" },
  { id: 33, label: "Short double bright tick" },
  { id: 48, label: "Smooth hum (gentle)" },
];

const effectRef = EFFECTS.map(e => `${e.id}=${e.label}`).join(", ");

module.exports = async function handler(req, res) {
  const mood = (req.query.mood ?? "surprise me").slice(0, 80);

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: `You are a haptic pattern designer for the DRV2605L vibration driver chip.
Available effects: ${effectRef}
Return ONLY valid JSON — no markdown, no explanation, no extra text:
{"label":"short name","description":"one sentence","pattern":[{"effect":N,"delay_after_ms":N}]}
Rules: use 2–6 effects. delay_after_ms must be between 50 and 2000. Total pattern duration under 5 seconds.`,
    messages: [{ role: "user", content: `Mood: ${mood}` }],
  });

  try {
    const pattern = JSON.parse(response.content[0].text);
    res.setHeader("Content-Type", "application/json");
    res.json(pattern);
  } catch {
    res.status(500).json({
      error: "Could not parse Claude response",
      raw: response.content[0].text,
    });
  }
};
```

**Deploy to Vercel:**

```bash
vercel deploy
```

Vercel will ask a few setup questions on first run — accept the defaults. When the deploy finishes, you get a URL like `https://haptic-api-yourname.vercel.app`.

**Add the API key as an environment variable.** In the Vercel dashboard → your project → Settings → Environment Variables, add:

```
ANTHROPIC_API_KEY = sk-ant-...your key here...
```

Then redeploy (`vercel deploy --prod`) so the function can access it.

**Test it in your browser:**

```
https://your-project.vercel.app/api/haptic?mood=calm
https://your-project.vercel.app/api/haptic?mood=urgent
https://your-project.vercel.app/api/haptic?mood=celebratory
```

You should get responses like:

```json
{
  "label": "gentle wave",
  "description": "A slow soft pulse that eases tension and invites stillness",
  "pattern": [
    { "effect": 48, "delay_after_ms": 900 },
    { "effect": 7,  "delay_after_ms": 1100 },
    { "effect": 48, "delay_after_ms": 700 }
  ]
}
```

> **📐 Concept Sidebar: Serverless Functions**
>
> A serverless function is a piece of code that runs on demand in the cloud without a persistent server you manage. Vercel spins up a container when a request arrives, runs your `handler` function, returns the response, and shuts down. You pay (or use the free tier) only for actual execution time.
>
> This architecture serves two purposes here:
>
> - **API key security** — the Anthropic key lives in Vercel's environment, not in firmware or committed code. Anyone who obtains your ESP32 cannot extract the key.
> - **Protocol translation** — the ESP32 makes a plain HTTP GET. It does not need to know anything about the Anthropic API, authentication headers, or JSON parsing for Claude's response envelope. The function abstracts that entirely.
>
> The tradeoff is **cold start latency**: the first request after several minutes of inactivity takes 1–3 extra seconds while Vercel provisions the container. Subsequent requests within the same active window are faster. For a demo, visit the URL in your browser once before pressing the button.

> **📐 Concept Sidebar: Prompting for Structured Output**
>
> The system prompt tells Claude to return only valid JSON with a specific schema. This technique — asking the model to produce structured data rather than prose — is called **constrained generation**. A few practices make it reliable:
>
> - **Show the exact schema** — give Claude the output format with field names and types, not just a description.
> - **Say "ONLY" explicitly** — "Return ONLY valid JSON" suppresses the markdown code fences and explanatory sentences Claude would otherwise add.
> - **Give Claude a bounded vocabulary** — by listing exactly which effect IDs it can use, you prevent it from hallucinating IDs 200 or 999 that don't exist on the chip.
> - **Wrap the parse in a try/catch** — even well-prompted models occasionally produce malformed JSON. The error branch returns the raw text so you can debug the prompt.

**Deliverable:** Visiting your Vercel URL in a browser returns a haptic pattern JSON with different patterns for different moods.

---

## SQ-3 — The Full Loop

Now combine everything. Pressing the BOOT button on the ESP32 triggers a WiFi GET to your Vercel function, Claude designs a pattern, the ESP32 parses the JSON, and the motor plays it.

**Hardware:** connect the DRV2605L via StemmaQT as in SQ-1. No additional wiring needed — the BOOT button (GPIO 0, active LOW) is built into the ESP32 Feather.

**Sketch folder structure:**

```
sq3-full-loop/
├── sq3_full_loop.ino
└── secrets.h          ← never commit this
```

**Arduino sketch:**

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_DRV2605.h>

#include "secrets.h"

Adafruit_DRV2605 drv;

const int BUTTON_PIN = 0; // BOOT button — active LOW, INPUT_PULLUP
bool lastState = HIGH;

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected: " + WiFi.localIP().toString());

  // DRV2605L
  Wire.begin();
  if (!drv.begin()) {
    Serial.println("DRV2605L not found — check wiring");
    while (1);
  }
  drv.selectLibrary(1);
  drv.setMode(DRV2605_MODE_INTTRIG);

  Serial.println("Ready — press the BOOT button for a pattern.");
}

void fetchAndPlay() {
  Serial.println("Requesting pattern from Claude...");

  HTTPClient http;
  http.begin(String(HAPTIC_URL) + "?mood=surprise+me");
  http.setTimeout(8000); // Claude Haiku responds in ~1-2s; 8s gives headroom

  int code = http.GET();
  if (code != 200) {
    Serial.println("HTTP error: " + String(code));
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    Serial.println("JSON parse error — check function logs");
    return;
  }

  Serial.println(">> " + doc["label"].as<String>());
  Serial.println("   " + doc["description"].as<String>());

  for (JsonObject step : doc["pattern"].as<JsonArray>()) {
    uint8_t effectId = step["effect"].as<uint8_t>();
    int delayMs      = step["delay_after_ms"] | 150;

    drv.setWaveform(0, effectId);
    drv.setWaveform(1, 0); // terminate sequence
    drv.go();
    delay(max(delayMs, 50)); // at least 50ms for the effect to fire
  }

  Serial.println("Pattern complete.");
}

void loop() {
  bool state = digitalRead(BUTTON_PIN);
  if (state == LOW && lastState == HIGH) {
    fetchAndPlay();
  }
  lastState = state;
  delay(10);
}
```

> **📐 Concept Sidebar: Latency and User Expectation**
>
> The gap between button press and first vibration is roughly 1–3 seconds:
>
> | Step | Typical time |
> |---|---|
> | WiFi round trip (ESP32 → Vercel) | ~100 ms |
> | Vercel cold start (if idle) | 0–1500 ms |
> | Claude Haiku inference | ~300–800 ms |
> | WiFi return + JSON parse | ~100 ms |
>
> For a haptic notification this latency is acceptable — you are not trying to match a real-time gesture. The pattern is worth the wait; it arrives as a complete, considered design rather than a preloaded static buzz.
>
> If cold starts are noticeable during a demo, visit your Vercel URL in a browser tab ~30 seconds before pressing the button — this warms the container.

**Deliverable:** Pressing the BOOT button → the Serial Monitor logs the pattern label and description → the motor plays the Claude-generated sequence roughly 1–2 seconds later.

---

## Where to Go Next

Some directions from here:

- **Mood cycling** — Add a second button (or long-press) that steps through a mood list (`["calm", "alert", "celebratory", "melancholy", "random"]`). Include the current mood as the `?mood=` query parameter in the GET request.

- **On-device display** — The description Claude returns (`"A slow double-pulse like a resting heartbeat"`) is human-readable text. Add an OLED display (SSD1306, StemmaQT) and print it there so someone watching knows what feeling was requested.

- **Close the loop** — Combine this side quest with the main project: when the pulse sensor detects BPM over a threshold, the ESP32 automatically requests an `"urgent"` pattern and plays it without any button press. The sensor drives the cloud request.

- **Pattern caching** — Fetch several patterns at boot (before the user presses anything) and store them in an array. A button press plays the next cached pattern immediately, while the ESP32 refetches in the background. The delay disappears entirely from the user's perspective.

- **Browser mood control** — Build a small browser interface using the browser-to-ESP32 side quest: a dropdown of moods sends the selected mood over WebSerial to the ESP32, which uses that string in its next cloud request. Browser picks the feeling; cloud designs the pattern; body receives it.

---

## Faculty Notes

> This section is for **instructors and course designers**.

### Design Decisions

**WiFi + cloud instead of WebSerial.**
This side quest deliberately introduces WiFi rather than extending the WebSerial path. The ESP32 acts autonomously — no laptop, no USB cable, no browser open. That independence is the point: the device has its own relationship with the cloud.

**DRV2605L effect library, not RTP mode.**
The DRV2605L supports two major operation modes. Real-Time Playback (RTP) mode allows arbitrary amplitude values over time, enabling fully custom waveforms. Effect library mode (used here) selects from 123 pre-engineered waveforms stored in chip ROM. The library was chosen because:
- Effect IDs are stable, discrete, and describable in natural language — Claude can reason about "strong click" vs "soft bump" meaningfully.
- The 8-slot hardware sequencer constrains pattern length naturally, keeping Claude's output bounded.
- Students do not need to manage timing at the sub-millisecond level.
RTP mode is a valid extension for students who want continuous, amplitude-modulated feedback.

**Claude Haiku, not Opus or Sonnet.**
Haiku is the right model for this use case: the generation task is simple (pick 2–6 effect IDs with delays), low latency matters (students are waiting for physical feedback), and students bear the cost of their own API calls. Switching to Opus would increase latency and cost ~25x with no meaningful quality benefit for this constrained output format.

**Vercel, not a local server or home server.**
Students need HTTPS for the ESP32 to make secure requests without certificate management. Vercel provides HTTPS automatically, deploys from a single CLI command, and has a generous free tier. The tradeoff is cold starts, which are addressed in the latency sidebar.

### Open Questions

- **DRV2605L availability** — Does every student still have their Human Augmentation kit including the DRV2605L and StemmaQT cable? If not, a cheap ERM motor driven by a GPIO + transistor + flyback diode is a viable substitute, but requires modifying the sketch to use `analogWrite()` with a custom `{intensity, duration}` pattern format instead of effect IDs.

- **CCA network access** — Personal hotspots solve the campus WiFi problem for most students but not all (some carriers throttle hotspot data, some phones need hotspot enabled in plan). Is there a CCA guest network that works for ESP32, or a department router students can use?

- **Anthropic API key distribution** — Should students create individual accounts, or should the course provide a shared key with usage limits? A shared key is simpler to set up but harder to audit; individual keys teach the full deployment workflow.

- **Vercel deployment complexity** — The Vercel CLI deployment is the highest technical barrier in this side quest. Students who have never used a terminal package manager may struggle with `npm install -g vercel`. Consider whether a pre-deployed shared function (with a course API key) makes more sense for a first pass, leaving personal deployment as an extension.

- **Effect library vs. open-ended generation** — Restricting Claude to 11 named effects keeps the output predictable and the prompt simple. A richer effect vocabulary (all 123 effects, or custom RTP sequences) would allow more expressive patterns but requires a longer prompt and more careful output parsing. The current vocabulary is a design choice, not a technical constraint.

- **What does it mean for AI to "design" a haptic pattern?** — This is worth a class discussion. Claude is making aesthetic and semantic choices (matching "calm" to smooth hum + soft bump) based on the descriptions in its training data and the vocabulary constraint in the prompt. Is that design? How would a student evaluate whether the pattern is good? Could the same prompt be used with user-supplied descriptions instead of moods?
