# Smart Object Foundations

## About This Project

**Smart Object Foundations** is a project in the MDes Prototyping course at CCA. It focuses on two new skills:

1. **Connecting your ESP32 to the browser** — sending sensor data from hardware into a web page using WebSerial
2. **Signal processing** — cleaning up noisy sensor readings and extracting meaningful information

The central hands-on example is a **pulse sensor heart-rate monitor**: you read an analog signal from a PulseSensor, stream it to your browser, visualize the waveform, and detect individual heartbeats.

---

## Where This Fits in the Course

| Project | Focus |
|---|---|
| ← [**Human Augmentation**](https://github.com/loopstick/ESP32_V2_Tutorial/blob/master/StemmaQT/README.md) | Arduino IDE, ESP32 v2, StemmaQT, DRV2605L haptic motor, LSM9DS1 IMU |
| → **Smart Object Foundations** *(you are here)* | WebSerial, data visualization in p5.js, signal processing with a pulse sensor |
| **Interactive Environment** | *(next project)* |

**You build on what you already know.** The Arduino IDE, ESP32v2 wiring, and analog sensing you practiced in Human Augmentation are the foundation here — this project adds the browser side of the pipeline and introduces signal processing.

---

## What You Will Build

A **real-time heartbeat detector** that runs across hardware and software:

```
PulseSensor → ESP32 → Serial → WebSerial → p5.js → heartbeat detection
```

1. Wire a PulseSensor to an ESP32 analog pin
2. Sample the signal in Arduino and send it over Serial
3. Connect your browser to the ESP32 using WebSerial
4. Draw a live scrolling waveform in p5.js / OpenProcessing
5. Apply signal processing to detect peaks and calculate BPM

---

## Tutorial Stages

### Stage 1 — Wire Up the Pulse Sensor

Connect a [PulseSensor](https://pulsesensor.com/) to an analog input on your ESP32v2.

**What you will do:**
- Connect the PulseSensor signal wire to an analog pin (e.g. A0)
- Power it from 3.3V and GND
- Open the Arduino Serial Plotter and confirm you can see the waveform

**Skill check:** Can you see a rhythmic pulse signal in the Serial Plotter when you hold the sensor to your fingertip?

---

### Stage 2 — Sample and Send Data over Serial

Read the sensor at a consistent rate and format the output so JavaScript can parse it.

**Topics:**
- Sampling with `analogRead()` at a steady interval (avoid `delay()`)
- Using `millis()` for non-blocking timing
- Printing a single value per line: `Serial.println(value);`
- Using the Arduino Serial Plotter to confirm the waveform looks right

> **Refresher:** If you need a reminder on sketch structure, `setup()` / `loop()`, or the Serial Monitor, revisit the [ESP32 v2 Tutorial](https://github.com/loopstick/ESP32_V2_Tutorial/tree/master) from Project 1.

**Skill check:** The Serial Plotter shows a clean, rhythmic wave at roughly 50–100 samples per second.

---

### Stage 3 — Connect to the Browser with WebSerial

Use the [WebSerial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) to pipe your serial data into a browser tab.

**Topics:**
- What WebSerial does and how to use it (Chrome / Edge only)
- Opening a serial port from JavaScript
- Reading and parsing incoming lines of text
- Feeding parsed values into your p5.js sketch

**Live demo sketches to study:**
- [WebSerial example 1](https://openprocessing.org/sketch/2576473)
- [WebSerial example 2](https://openprocessing.org/sketch/2583498)
- [WebSerial example 3](https://openprocessing.org/sketch/2584328)

**Goal:** Numbers from your ESP32 appear in the browser console as they arrive.

---

### Stage 4 — Visualize the Signal in p5.js

Draw the incoming data as a scrolling waveform.

**Topics:**
- Storing samples in a fixed-length array
- Shifting old values out as new ones arrive
- Drawing the array as a line graph across the canvas
- Scaling and labeling the display

**Deliverable:** A live waveform that scrolls continuously in your OpenProcessing sketch.

---

### Stage 5 — Signal Processing: Clean Up and Detect Peaks

Raw sensor data is noisy. Learn to smooth it and detect heartbeat peaks.

**Topics:**
- Moving average (smoothing / integration)
- Rate of change (finding rises and falls)
- Peak detection (finding local maxima above a threshold)
- Calculating beats per minute from peak timing
- Noise reduction

**Outcome:** Your sketch reliably detects each heartbeat and displays a running BPM value.

---

### Stage 6 — Expressive Outputs (Extension)

Map your heartbeat data to something physical or expressive.

**Ideas:**
- Drive an LED or NeoPixel in time with your pulse
- Trigger haptic feedback (you already have the DRV2605L from Project 1!)
- Create a sound or visual reaction to each beat

**Inspiration:** [Enchanted Objects](https://enchantedobjects.com/)

---

### Stage 7 — Networking (Extension)

Explore sending data over Wi-Fi instead of USB.

**Concepts:**
- MQTT messaging protocol
- Cloud-connected devices
- Web-based device communication

**Example:** [MQTT in OpenProcessing](https://openprocessing.org/sketch/2203435)

> **Note:** Wi-Fi on the ESP32 adds configuration complexity (especially on managed networks like CCA's). WebSerial over USB is usually sufficient for this project.

---

## Getting Started Checklist

*(You already have the Arduino IDE and ESP32 board support installed from Project 1.)*

- [ ] Install the **PulseSensor Playground** library (`Sketch → Manage Libraries → search "PulseSensor Playground"`)
- [ ] Wire up a PulseSensor to your ESP32 (signal → A0, power → 3.3V, GND → GND)
- [ ] Upload the starter sketch and confirm the waveform in the Arduino Serial Plotter
- [ ] Open a WebSerial demo sketch in OpenProcessing (Chrome or Edge)
- [ ] Click "Connect" and select your ESP32 — confirm values arrive in the sketch
- [ ] Build your own p5.js sketch that draws the waveform
- [ ] Add peak detection and a BPM display

---

---

# Faculty Notes

> This section is for **instructors and course designers**. It covers open questions, pedagogical decisions, and ideas that are still being worked out.

## Project Context

This is the second hands-on project in the MDes Prototyping sequence:

1. **Human Augmentation** — Students learn the tool chain (Arduino IDE, ESP32 v2, StemmaQT, DRV2605L, LSM9DS1). Reference tutorial: [loopstick/ESP32_V2_Tutorial](https://github.com/loopstick/ESP32_V2_Tutorial/blob/master/StemmaQT/README.md).
2. **Smart Object Foundations** *(this project)* — Students add the browser half of the pipeline and learn basic signal processing.
3. **Interactive Environment** — Next project (details TBD).

The pulse sensor is chosen intentionally: it produces a visible, rhythmic signal that is easy to debug, satisfying to get working, and biologically meaningful — a good motivator.

## Curriculum Design Questions

- How much weight should go to **physical prototyping** versus the software systems built around hardware?
- Are students actually learning the target skills when they rely heavily on AI or "vibe coding" tools? How do we assess that?
- Which should the curriculum optimize for?
  - Technical understanding
  - Creative momentum
  - Rapid experimentation

## Technology Decisions

- **WebSerial vs. Wi-Fi/MQTT:** WebSerial is simpler and avoids CCA network configuration issues. For most instructional goals it is sufficient. Introducing Wi-Fi networking on the ESP32 may not be worth the added complexity.
- Students already have DRV2605L haptic motors from Project 1 — the Stage 6 extension can leverage that for a satisfying cross-project connection.

## Possible Additional Materials

- A **step-by-step pulse sensor lab sequence** with per-stage checkpoints (recommended as the core unit)
- AI / inquiry tool integration: NotebookLM for research, LLM-based debugging prompts, "questions to ask" frameworks
- Expanded assessment rubrics aligned to rapidly evolving student tool use

## Keeping Material Current

Student tools (especially AI coding assistants) evolve quickly. Course materials, exercises, and evaluation methods should be revisited each term to stay aligned with how students actually work.
