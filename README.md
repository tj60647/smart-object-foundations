# Smart Object Foundations

## Welcome

In this course you will build **Smart Objects**—physical devices that sense the world and share that information with software running in a browser. By the end you will have a working pulse-sensor heart-rate monitor and the skills to extend it into your own interactive or expressive project.

**You will work with:**
- An **ESP32 v2** microcontroller and the **Arduino IDE**
- **WebSerial** to send data from the device to your laptop
- **p5.js / OpenProcessing** to visualize and process the data in real time

---

## Tutorial Roadmap

### Stage 1 — Core Project: Pulse Sensor Heartbeat Monitor

Your central project is a **real-time heartbeat detector** using a PulseSensor and an ESP32.

**What you will do:**
1. Wire a PulseSensor to an ESP32
2. Read the analog signal in Arduino and print it over Serial
3. Connect to your browser using WebSerial
4. Draw a live waveform in p5.js
5. Detect heartbeat peaks and display beats-per-minute

This project is your launchpad. Everything else builds on it.

**Key concepts you will practice:**
- Analog sensing
- Signal sampling
- Serial communication
- Real-time visualization
- Basic signal processing

---

### Stage 2 — Arduino / ESP32 Basics

Before wiring up the pulse sensor, make sure you are comfortable with the Arduino environment.

**Topics:**
- Arduino IDE: installing, uploading, using the Serial Monitor
- Sketch structure: `setup()` and `loop()`
- Reading analog inputs with `analogRead()`
- Controlling sample timing so readings are consistent
- Formatting data as clean Serial output
- Using the Arduino Serial Plotter to see a live signal

**Skill check:** Can you read a sensor value and print it at a steady rate?

---

### Stage 3 — Serial Communication and WebSerial

Learn how data travels from the ESP32 into the browser.

**Topics:**
- What serial communication is and why formatting matters
- Sending data from Arduino in a format JavaScript can parse
- Using the WebSerial API to connect a browser to a serial device
- Parsing the incoming data stream in p5.js

**Live demo sketches:**
- [WebSerial example 1](https://openprocessing.org/sketch/2576473)
- [WebSerial example 2](https://openprocessing.org/sketch/2583498)
- [WebSerial example 3](https://openprocessing.org/sketch/2584328)

**Goal:** Data flows continuously from your microcontroller into your p5.js sketch.

---

### Stage 4 — Data Visualization in p5.js / OpenProcessing

Now that data is arriving in the browser, make it visible.

**Topics:**
- Storing incoming samples in an array
- Drawing a scrolling time-series graph
- Adding labels, scales, and visual polish
- Designing a readable sensor display

**Deliverable:** A live waveform that scrolls as your pulse sensor data arrives.

---

### Stage 5 — Signal Processing

Raw sensor values are noisy. Learn to clean them up and extract meaning.

**Topics:**
- Moving average (smoothing)
- Rate of change (detecting rises and falls)
- Standard deviation (measuring variation)
- Peak detection
- Noise reduction techniques

**Outcome:** Your sketch detects individual heartbeat peaks and calculates BPM.

---

### Stage 6 — Expressive Outputs

Extend your smart object beyond a screen display.

**Ideas:**
- LED patterns that respond to your heartbeat
- Sound that pulses in time with your heart rate
- Combining multiple sensors for richer data

**Inspiration:** [Enchanted Objects](https://enchantedobjects.com/)

---

### Stage 7 — Networking (Extension)

If you want to go further, explore sending data over Wi-Fi.

**Concepts:**
- MQTT messaging
- Cloud-connected devices
- Web-based device communication

**Example:** [MQTT in OpenProcessing](https://openprocessing.org/sketch/2203435)

> **Note:** Wi-Fi on the ESP32 adds configuration complexity. WebSerial + p5.js is usually enough for class projects.

---

## Getting Started Checklist

- [ ] Install the Arduino IDE
- [ ] Add ESP32 board support to the Arduino IDE
- [ ] Install the PulseSensor Playground library
- [ ] Wire up a PulseSensor to your ESP32 (analog pin)
- [ ] Upload the starter sketch and verify Serial output
- [ ] Open the WebSerial demo sketch in OpenProcessing
- [ ] Connect your ESP32 and see the waveform appear

---

---

# Faculty Notes

> This section is for **instructors and course designers**. It covers open questions, pedagogical decisions, and ideas that are still being worked out.

## Curriculum Design Questions

- How much weight should go to **physical prototyping** versus the software systems built around hardware?
- Are students actually learning the target skills when they rely heavily on AI or "vibe coding" tools? How do we assess that?
- Which should the curriculum optimize for?
  - Technical understanding
  - Creative momentum
  - Rapid experimentation

## Technology Decisions

- **WebSerial vs. Wi-Fi/MQTT:** WebSerial is simpler to set up and avoids CCA network configuration issues. For most instructional goals it is sufficient. Introducing Wi-Fi networking on the ESP32 may not be worth the added complexity.
- The pulse sensor project is intentionally chosen because it produces a visible, rhythmic signal that is easy to debug and satisfying to get working.

## Possible Additional Materials

- A **step-by-step pulse sensor lab sequence** with checkpoints (recommended as the core unit)
- AI / inquiry tool integration: NotebookLM for research, LLM-based debugging prompts, "questions to ask" frameworks
- Expanded assessment rubrics aligned to rapidly evolving student tool use

## Keeping Material Current

Student tools (especially AI coding assistants) evolve quickly. Course materials, exercises, and evaluation methods should be revisited each term to stay aligned with how students actually work.
