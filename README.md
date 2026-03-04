# Smart Object Foundations

## About This Project

**Smart Object Foundations** is a project in the MDes Prototyping course at CCA. It focuses on two new skills:

1. **Connecting your ESP32 to the browser** — streaming raw sensor data from hardware into a web page using WebSerial
2. **Signal processing** — transforming a noisy analog signal into a reliable, meaningful measurement, step by step

The hands-on thread running through the whole project is a **pulse sensor heart-rate monitor**. You will start with a raw analog waveform and progressively process it until you can detect individual heartbeats and report beats per minute with a confidence value.

---

## Where This Fits in the Course

| Project | Focus |
|---|---|
| ← [**Human Augmentation**](https://github.com/loopstick/ESP32_V2_Tutorial/blob/master/StemmaQT/README.md) | Arduino IDE, ESP32 v2, StemmaQT, DRV2605L haptic motor, LSM9DS1 IMU |
| → **Smart Object Foundations** *(you are here)* | WebSerial, p5.js visualization, signal processing from raw data |
| **Interactive Environment** | *(next project)* |

**You build on what you already know.** The Arduino IDE, ESP32 v2 wiring, and analog sensing you practiced in Human Augmentation are the foundation — this project adds the browser side of the pipeline and introduces signal processing from first principles.

---

## Why No Library?

The [PulseSensor Playground](https://github.com/WorldFamousElectronics/PulseSensorPlayground) library is a popular ready-made solution for reading a pulse sensor. We are **not using it** in this project, for a deliberate reason.

The library hides almost every interesting step: it samples the sensor on a hardware timer, subtracts a rolling baseline, applies its own smoothing, and hands you a pre-detected beat event. That is convenient, but it means you never see or touch the data that makes all of that possible.

This project is about those steps. You will implement each one yourself, in plain JavaScript running in the browser, so you understand what the library was doing — and so you can apply the same techniques to any sensor you meet in the future.

> **What the library does that you will replicate:**
> 1. Samples the sensor at a consistent rate using a hardware timer interrupt
> 2. Subtracts a slowly-updating baseline to remove DC offset (background subtraction)
> 3. Applies a moving average to smooth out high-frequency noise (integration)
> 4. Looks for a rising signal that crosses a threshold (peak detection)
> 5. Times the interval between peaks and computes BPM

You will do all five of these in p5.js, with explicit code you can inspect and modify.

---

## What You Will Build

A real-time heartbeat detector running across hardware and software:

```
fingertip → PulseSensor → ESP32 analogRead() → Serial → WebSerial → p5.js
                                                                        ↓
                                                              raw waveform displayed
                                                                        ↓
                                                         background subtracted + smoothed
                                                                        ↓
                                                         peaks detected → BPM + confidence
```

The work is divided into four stages. Each stage produces something you can see and test before moving to the next.

---

## Folder Structure

Each stage has a self-contained folder. Open Arduino sketches in the Arduino IDE; open p5 sketches in OpenProcessing or locally via `index.html` in Chrome / Edge.

```
stage-0-wire-and-verify/
└── stage_0_wire_and_verify/
    └── stage_0_wire_and_verify.ino   ← open in Arduino IDE

stage-1-raw-waveform/
├── stage_1_send_data/
│   └── stage_1_send_data.ino         ← open in Arduino IDE (also used for Stages 2 & 3)
└── p5/
    ├── index.html                    ← open locally in Chrome / Edge
    └── sketch.js                     ← paste into OpenProcessing

stage-2-clean-signal/
└── p5/
    ├── index.html
    └── sketch.js

stage-3-heartbeat-detection/
└── p5/
    ├── index.html
    └── sketch.js
```

---

## Stage 0 — Wire Up and Verify

Connect the PulseSensor to your ESP32 and confirm the analog signal exists before writing any processing code.

**Hardware connections:**

| PulseSensor wire | ESP32 v2 pin |
|---|---|
| Red (power) | 3.3V |
| Black (ground) | GND |
| Purple (signal) | A0 (or any analog-capable pin) |

📂 **Arduino sketch:** [`stage-0-wire-and-verify/stage_0_wire_and_verify/stage_0_wire_and_verify.ino`](stage-0-wire-and-verify/stage_0_wire_and_verify/stage_0_wire_and_verify.ino)

Open this in the Arduino IDE and upload it to your ESP32. Open `Tools → Serial Plotter` at 115200 baud. Place your fingertip on the sensor — you should see a rhythmic wave that rises and falls with each heartbeat.

> **📐 Concept Sidebar: Nyquist Theorem and Sampling Rate**
>
> When you sample an analog signal, you need to sample at least **twice as fast as the highest frequency you care about** — this is the Nyquist theorem.
>
> A resting heart beats roughly 1 Hz (60 BPM). The waveform shape contains frequency content up to maybe 10–20 Hz. Sampling at 100 Hz (every 10 ms) gives you 5–10× headroom above the signal's highest meaningful frequency, which is plenty.
>
> Sampling too slowly (say, 5 Hz) would distort the shape of the waveform and make peak detection unreliable. Sampling much faster than needed wastes Serial bandwidth and browser CPU.
>
> **Rule of thumb for this project:** 50–100 Hz is the sweet spot.

> **📐 Concept Sidebar: Timestamps vs. Sample Count**
>
> Your ESP32 sketch uses `millis()` to ensure samples are evenly spaced in time. This matters because any jitter in the interval between samples distorts your signal.
>
> You have two choices for how to label samples when you send them to the browser:
>
> - **Implicit time** — send just the value (`Serial.println(rawValue)`). The browser assumes samples arrive at a fixed rate and uses the sample index as a proxy for time. Simple, but breaks if any sample is dropped.
> - **Explicit timestamp** — send both (`Serial.print(now); Serial.print(","); Serial.println(rawValue)`). The browser uses the real timestamp. Robust against dropped samples, required for accurate BPM calculation.
>
> For this project, start with implicit time (simpler). Switch to explicit timestamps when you start computing BPM.

**Skill check:** The Serial Plotter shows a clean, rhythmic wave. You can see roughly one peak per second (at a resting heart rate).

---

## Stage 1 — Raw Signal in the Browser

Get the raw numbers from your ESP32 into a p5.js sketch and draw them as a scrolling waveform.

### 1a — Send timestamped data from the ESP32

📂 **Arduino sketch:** [`stage-1-raw-waveform/stage_1_send_data/stage_1_send_data.ino`](stage-1-raw-waveform/stage_1_send_data/stage_1_send_data.ino)

This sketch sends lines like `1234,2048` — Arduino milliseconds and raw ADC value — over Serial at 100 Hz. **This same Arduino sketch is used for Stages 2 and 3.** No further changes to the hardware side are needed after this point.

### 1b — Receive and display in p5.js

📂 **p5.js sketch:** [`stage-1-raw-waveform/p5/sketch.js`](stage-1-raw-waveform/p5/sketch.js)

- **OpenProcessing:** paste the contents of `sketch.js` into a new sketch.
- **Locally:** open `stage-1-raw-waveform/p5/index.html` in Chrome or Edge.

The sketch maintains a 500-sample circular buffer (`rawBuffer`) of the most recent readings and draws it as a scrolling waveform.

> **📐 Concept Sidebar: Data Buffers and Rolling Windows**
>
> `rawBuffer` is a **circular buffer** (also called a ring buffer or rolling window): a fixed-length array that always holds the most recent N samples. When a new sample arrives you `push()` it onto the end and `shift()` one off the front. The array length never changes.
>
> Why fixed length? Because you are drawing to a fixed-width canvas. You always want exactly as many samples as you have pixels (or columns) to draw into. A buffer that grows without bound would eventually run out of memory.
>
> The **window size** (500 samples at 100 Hz = 5 seconds of history) is a design choice. A wider window shows longer-term trends; a narrower window shows fine-grained shape. You will use different window sizes at different stages.

**Deliverable:** A live scrolling waveform in the browser. You should see the same rhythmic shape you saw in the Serial Plotter.

---

## Stage 2 — Clean Signal

Raw sensor data contains two kinds of "noise" you need to remove before you can detect peaks reliably:

1. **Slow drift / DC offset** — the baseline level of the signal shifts slowly as the sensor moves on your finger. This is low-frequency variation.
2. **High-frequency noise** — small sample-to-sample jitter from electrical interference and ADC quantization.

📂 **p5.js sketch:** [`stage-2-clean-signal/p5/sketch.js`](stage-2-clean-signal/p5/sketch.js)

- **OpenProcessing:** paste the contents of `sketch.js` into a new sketch.
- **Locally:** open `stage-2-clean-signal/p5/index.html` in Chrome or Edge.

This is a complete, standalone sketch — no Stage 1 code needed. Use the same Arduino sketch from Stage 1.

### 2a — Background subtraction

A **baseline** is a slowly-updating average of the signal. When you subtract it from each sample, you remove the slow drift and center the waveform around zero. The result is a "DC-free" signal where the interesting heartbeat peaks stand out above a flat baseline.

The sketch computes the baseline as the **mean of the last 500 raw samples** (5 seconds at 100 Hz):

```
baseline = mean of the last BASELINE_N raw samples
dc_free  = raw − baseline
```

The sketch uses `BASELINE_N = 500` (a 5 s window). You can tune this constant in `sketch.js` — a larger window tracks drift more slowly; a smaller window is more responsive but risks pulling the baseline toward the heartbeat peaks themselves.

> **📐 Concept Sidebar: Background Subtraction**
>
> Every sensor has a **background level** — an offset or drift that has nothing to do with the signal you care about. A photodetector sitting in ambient light, a microphone in a noisy room, a pressure sensor with a static reading — all have backgrounds.
>
> **Background subtraction** is the process of estimating that background and removing it. The sketch uses a **buffer-based moving average**: keep a rolling buffer of the last N raw samples, compute their mean, and subtract it.
>
> ```
> baseline = mean(last N raw samples)
> dc_free  = raw − baseline
> ```
>
> The parameter N controls how slowly the baseline tracks the signal:
> - N very large → baseline tracks very slowly → removes only long-term drift, leaves heartbeat shape intact
> - N very small → baseline tracks quickly → risks pulling toward the heartbeat signal itself
>
> For a 100 Hz signal where heartbeats are ~1 Hz, N = 500 gives a 5-second window. That is slow enough to follow posture changes but fast enough to adapt over time.
>
> This approach is a **low-pass filter**: it keeps only slow (low-frequency) variation in the baseline estimate and throws away the fast heartbeat component. Subtracting it removes the DC component and slow drift, leaving only the heartbeat AC signal.
>
> **Alternative — exponential moving average (EMA):** instead of an explicit buffer, you can update a single running variable: `baseline = baseline + α × (raw − baseline)`. This is computationally cheaper and uses no extra memory, but the logic ("all past samples contribute with exponentially decaying weight, controlled by α") is less transparent than "average the last N seconds". For learning, the buffer approach is usually easier to reason about.

### 2b — Smoothing with a moving average (integration)

After background subtraction, the signal still has sample-to-sample jitter. A **moving average** averages the last N samples together, which blurs out fast noise while preserving slower, larger features like heartbeat peaks.

The sketch uses `SMOOTH_N = 15` (150 ms at 100 Hz). Try changing this constant in `sketch.js` to see the effect — smaller values are noisier, larger values are smoother but slightly delay peaks.

> **📐 Concept Sidebar: Integration and Moving Average**
>
> In signal processing, **integration** means accumulating (summing) a signal over time. A moving average is a simple discrete integrator: it sums the last N samples and divides by N.
>
> The effect is a **low-pass filter** — high frequencies (fast wiggles) average to near zero because their positive and negative excursions cancel out. Low frequencies (slow changes, like a heartbeat) survive because consecutive samples all point the same direction.
>
> The tradeoff: a larger window N → smoother signal, but the peaks become wider and slightly delayed in time. For peak detection, you want the signal smooth enough that noise doesn't trigger false peaks, but sharp enough that you can pinpoint when each peak occurs.
>
> Try N = 5, 15, and 30 and observe how the waveform changes.

> **📐 Concept Sidebar: Average and Rolling Windows**
>
> A **simple average** divides the sum of all values by the count: `mean = Σx / N`. It is the most basic summary of a dataset.
>
> A **rolling (moving) average** applies the same calculation, but only to the most recent N samples. As each new sample arrives, the oldest drops off. This lets the average "follow" a changing signal rather than reflecting all history equally.
>
> Rolling windows appear constantly in signal processing:
> - **Short window** → tracks fast changes, less smoothing
> - **Long window** → very smooth, lags behind changes
>
> The "right" window size depends on the timescale of the features you want to preserve vs. the timescales of the noise you want to remove. For heartbeat detection at 100 Hz, 10–20 samples (100–200 ms) is a reasonable starting range.

> **📐 Concept Sidebar: Low-pass and High-pass Filters**
>
> Every processing step in this project is a **filter**. Understanding them as filters gives you a vocabulary that applies to audio, images, sensor signals, and almost any data you will encounter.
>
> **Low-pass filter (LPF)** — passes slow (low-frequency) changes; blocks fast (high-frequency) changes. Think of it as a smoothing operation.
>
> Both signal-cleaning steps in Stage 2 are low-pass filters implemented as **buffer-based moving averages** — they differ only in window size:
>
> | Step | Window | Purpose |
> |---|---|---|
> | Stage 2a — baseline (BASELINE_N = 500) | 5 s at 100 Hz | Captures only slow DC drift; subtracting it removes the background |
> | Stage 2b — smoothing (SMOOTH_N = 15) | 150 ms at 100 Hz | Removes sample-to-sample jitter while preserving heartbeat peaks |
>
> Using an explicit buffer makes the logic transparent: "average the last N samples." An alternative is an **exponential moving average (EMA)** — a single variable updated with `baseline += α × (input − baseline)` — which is more memory-efficient but less intuitive. Both are valid low-pass filters; the buffer approach is used here for clarity.
>
> **High-pass filter (HPF)** — passes fast (high-frequency) changes; blocks slow (low-frequency) changes. Think of it as a *change detector* or *edge detector*.
>
> - **Differentiation (Stage 3a)** — `slope[n] = signal[n] − signal[n−1]` is a high-pass filter. A constant or slowly-drifting signal produces near-zero output. A rapid rise or fall produces a large positive or negative spike. This is exactly what you need to locate the peak of a heartbeat.
>
> **The full filter chain in this project:**
>
> ```
> raw signal
>   → LPF: 5 s moving average removes slow DC drift   (background subtraction)
>   → LPF: 150 ms moving average removes fast noise    (smoothing)
>   → HPF: differentiation finds rising edges          (peak detection)
> ```
>
> After the two low-pass stages you have a clean, centered signal. The high-pass stage then highlights exactly the rapid transitions that mark heartbeat peaks.

**Deliverable:** Open the Stage 2 sketch to see the raw signal (blue, top half) and the smoothed DC-free signal (amber, bottom half) displayed together in real time. The bottom trace should be centered on zero, smoother, and free of slow drift.

---

## Stage 3 — Heartbeat Detection with Confidence

With a clean signal in hand, you can now detect peaks. Each peak corresponds to one heartbeat.

📂 **p5.js sketch:** [`stage-3-heartbeat-detection/p5/sketch.js`](stage-3-heartbeat-detection/p5/sketch.js)

- **OpenProcessing:** paste the contents of `sketch.js` into a new sketch.
- **Locally:** open `stage-3-heartbeat-detection/p5/index.html` in Chrome or Edge.

This is a complete, standalone sketch. Use the same Arduino sketch from Stage 1.

### 3a — Differentiation: finding rises and falls

The **derivative** (rate of change) of a signal tells you whether it is going up or down at each moment. A heartbeat peak is where the signal transitions from rising to falling — i.e., where the derivative crosses zero from positive to negative.

The discrete derivative (first difference):

```
slope[n] = signal[n] − signal[n−1]
```

> **📐 Concept Sidebar: Differentiation**
>
> **Differentiation** measures how fast a signal is changing. The continuous derivative is dy/dt — the slope of the curve at each instant. In discrete (sampled) signals, you approximate it with the **first difference**: `slope[n] = signal[n] - signal[n-1]`.
>
> The derivative of a smooth bell-shaped heartbeat peak looks like an S-curve: positive (rising slope) before the peak, zero at the top, negative (falling slope) after it. Detecting the **zero crossing** from positive to negative gives you the precise timing of the peak.
>
> Differentiation amplifies noise — any jitter in the signal becomes large, fast swings in the derivative. This is why you must smooth the signal *before* differentiating.
>
> Differentiation is a **high-pass filter**: it passes fast changes (large output) and suppresses slow or constant signals (output near zero). This is the conceptual opposite of the moving average (a low-pass filter) applied in Stage 2b. Together, the two low-pass stages clean the signal and the high-pass stage reveals the sharp transitions that mark heartbeat peaks — see the Low-pass and High-pass Filters sidebar in Stage 2.

### 3b — Peak detection with a threshold

A zero crossing alone is not enough — noise creates many small zero crossings. The sketch adds an **amplitude threshold**: a peak is only declared if the smoothed signal is above `AMPLITUDE_THRESHOLD` at the moment of the zero crossing.

The default is `AMPLITUDE_THRESHOLD = 80`. This applies to the DC-free smoothed signal (not the raw 0–4095 ADC range) — heartbeat peaks typically rise 50–300 units above the baseline. Tune this constant in `sketch.js`: lower if beats are missed, higher if noise triggers false peaks.

> **📐 Concept Sidebar: Pattern Matching**
>
> Peak detection is a simple form of **pattern matching** — you are looking for a specific shape in a time series: a value that is above a threshold *and* at which the signal transitions from rising to falling.
>
> More sophisticated pattern matching looks for longer templates: you define a "prototype heartbeat shape" and slide it across the signal looking for high correlation. This is how ECG systems detect arrhythmias — they match the incoming signal against libraries of known waveform patterns.
>
> For a photoplethysmography (PPG) sensor like the PulseSensor, simple peak detection is usually sufficient because the heartbeat waveform is relatively consistent in shape.

### 3c — BPM and confidence value

Once peaks are detected, the sketch calculates the **inter-beat interval (IBI)** from the number of samples between consecutive peaks:

```
IBI (ms) = samples_between_peaks × SAMPLE_INTERVAL_MS
BPM      = 60000 / mean(IBI)
```

Using sample counts instead of wall-clock timestamps avoids a subtle bug: the browser's `millis()` and the Arduino's `millis()` are two unrelated clocks that start at different times. Tracking which sample index each peak belongs to keeps everything in the same coordinate system.

**Confidence** uses the coefficient of variation (CV) of the IBI series:

```
CV         = stdDev(IBI) / mean(IBI)
confidence = max(0, 1 − CV / 0.3)
```

CV = 0 means perfectly regular beats; CV above 0.3 is considered unreliable. The sketch maps this to a 0–1 confidence score displayed in green (≥ 0.7), yellow (≥ 0.4), or red (< 0.4).

### 3d — What you will see

Open the Stage 3 sketch. You will see:

- **Blue trace (top)** — raw signal from the ESP32
- **Amber trace (bottom)** — smoothed, DC-free signal
- **Red tick marks** — detected heartbeat peaks on the smoothed trace
- **Top-right readout** — BPM (large) and confidence % (color-coded)

**Deliverable:** Reliable peak detection with a BPM reading that stabilises within a few seconds of placing your finger on the sensor. Move your finger or pick it up — watch the confidence value drop and the tick marks become erratic.

---

## Getting Started Checklist

*(You already have the Arduino IDE and ESP32 board support installed from Project 1.)*

- [ ] Wire up the PulseSensor (signal → A0, power → 3.3V, GND → GND)
- [ ] Upload `stage-0-wire-and-verify` — confirm the waveform in the Arduino Serial Plotter
- [ ] Upload `stage-1-raw-waveform` Arduino sketch — confirm `ts,value` lines in Serial Monitor
- [ ] Open a WebSerial demo sketch in OpenProcessing (Chrome or Edge), connect your ESP32
- [ ] Open the Stage 1 p5 sketch — confirm the scrolling raw waveform
- [ ] Open the Stage 2 p5 sketch — confirm the smoothed, DC-free waveform appears below
- [ ] Open the Stage 3 p5 sketch — tune `AMPLITUDE_THRESHOLD` until peaks are detected reliably
- [ ] Observe the confidence value — try moving your finger and watch it drop

---

## Glossary

**ADC (Analog-to-Digital Converter)**
Hardware that converts a continuous voltage into a discrete integer. The ESP32's ADC is 12-bit, producing values from 0 to 4095.

**Background subtraction**
Estimating and removing the slowly-varying baseline level of a signal so that the interesting fast changes stand out. Implemented here as an exponential moving average subtracted from the raw signal.

**BPM (Beats Per Minute)**
Heart rate expressed as beats per minute. Computed as 60,000 ÷ average inter-beat interval (in ms).

**Buffer / circular buffer**
A fixed-length array that stores the most recent N samples. New samples are added to one end; old samples are discarded from the other. Also called a ring buffer or rolling buffer.

**Coefficient of Variation (CV)**
Standard deviation divided by mean. A dimensionless measure of relative variability. CV = 0 means all values are identical; CV = 1 means the standard deviation equals the mean. Used here as the basis for confidence scoring.

**Confidence value**
A 0–1 score indicating how reliable the current BPM estimate is. Derived from the consistency of inter-beat intervals. High confidence = regular, consistent beats. Low confidence = irregular intervals, likely caused by motion or poor sensor contact.

**DC offset**
A constant added to a signal that shifts its average value away from zero. Photoplethysmography sensors produce a signal with a large DC offset (ambient light on the photodetector) plus a small AC component (the heartbeat pulse). Background subtraction removes the DC offset.

**Derivative / first difference**
The rate of change of a signal. In discrete samples: `slope[n] = signal[n] - signal[n-1]`. The derivative is positive when the signal is rising, negative when falling, and zero at a peak or trough.

**Differentiation**
Computing the derivative of a signal. Used here to find the zero crossing (positive → negative slope) that marks a heartbeat peak.

**Exponential Moving Average (EMA)**
A weighted moving average in which more recent samples receive more weight. Updated with `ema = ema + α × (new_value - ema)`. The parameter α (alpha) controls how quickly the average responds to changes. EMA is an *infinite impulse response (IIR)* low-pass filter: it uses a single variable rather than an explicit buffer, so all past samples contribute with exponentially decaying weight.

**High-pass filter**
A filter that passes high-frequency (fast-changing) content and attenuates low-frequency (slow-changing) content. Differentiation (computing the first difference of a signal) is a high-pass filter: it produces large output for rapid changes and near-zero output for constant or slowly-drifting signals. Contrast with *low-pass filter*.

**IBI (Inter-Beat Interval)**
The time in milliseconds between two consecutive heartbeat peaks. The inverse of heart rate: BPM = 60,000 / IBI.

**Integration**
In signal processing, accumulating (summing) a signal over time. A moving average is a form of integration. Integration smooths out high-frequency noise (a low-pass filter effect).

**Low-pass filter**
A filter that passes low-frequency (slow-changing) content and attenuates high-frequency (fast-changing) content. Both signal-cleaning steps in Stage 2 are low-pass filters: the moving average is a *finite impulse response (FIR)* LPF that averages an explicit buffer of the last N samples; the EMA is an *infinite impulse response (IIR)* LPF that uses a single accumulating variable. Either can serve as a baseline estimator for background subtraction. Contrast with *high-pass filter*.

**Moving average**
The average of the last N samples in a buffer, updated as each new sample arrives. Also called a simple moving average (SMA) or box filter.

**Nyquist frequency**
Half the sampling rate. The highest frequency that can be correctly represented in a sampled signal. At 100 Hz sampling, the Nyquist frequency is 50 Hz — any signal component faster than 50 Hz will be aliased (distorted).

**Nyquist theorem**
States that a signal must be sampled at least twice the frequency of its highest component to be reconstructed without aliasing. For practical purposes, sample 5–10× faster than the highest frequency you care about.

**Pattern matching**
Finding occurrences of a known shape or template in a time series. Peak detection is the simplest form: matching a "local maximum above threshold" pattern.

**Peak detection**
Identifying local maxima in a signal that exceed a minimum amplitude threshold. Used here to find heartbeat peaks in the smoothed waveform.

**Rolling window**
See *buffer / circular buffer*. A window that moves through the signal as time advances, always covering the most recent N samples.

**Sampling rate**
How many samples per second are collected from a sensor. Measured in Hz (samples per second) or equivalently as the interval between samples in milliseconds.

**Signal processing**
Any mathematical transformation applied to a measured signal to extract information from it or to remove unwanted noise. The stages in this project — background subtraction, smoothing, differentiation, peak detection — are all signal processing steps.

**Standard deviation**
A measure of how spread out a set of values is around their mean. Computed as the square root of the variance. Used here to measure the consistency of inter-beat intervals.

**Threshold**
A minimum (or maximum) value that must be exceeded for a condition to be declared true. In peak detection, the threshold prevents noise fluctuations from being mistaken for heartbeat peaks.

**Timestamp**
A record of when something happened, usually in milliseconds since the microcontroller powered on (`millis()` on Arduino). Timestamps allow you to compute elapsed time between events (like heartbeat peaks) accurately, independent of sampling rate jitter.

**Zero crossing**
The moment when a signal crosses zero (or when the slope crosses zero). A positive-to-negative zero crossing in the derivative marks the peak of a signal.

---

---

# Faculty Notes

> This section is for **instructors and course designers**.

## Project Context

This is the second hands-on project in the MDes Prototyping sequence:

1. **Human Augmentation** — Tool chain: Arduino IDE, ESP32 v2, StemmaQT, DRV2605L, LSM9DS1. Reference: [loopstick/ESP32_V2_Tutorial](https://github.com/loopstick/ESP32_V2_Tutorial/blob/master/StemmaQT/README.md).
2. **Smart Object Foundations** *(this project)* — WebSerial pipeline and signal processing from first principles using raw `analogRead()`.
3. **Interactive Environment** — Next project (details TBD).

## Technology Decisions

**No PulseSensor library.**
The PulseSensor Playground library is explicitly excluded. It abstracts away the core learning objectives of this project: background subtraction, integration, differentiation, peak detection, and confidence scoring. Students should see and write each step explicitly in JavaScript.

Assessment opportunity: ask students to describe what each processing step does and what the waveform looks like at each stage. If they used the library, they cannot answer this.

**WebSerial vs. Wi-Fi/MQTT.**
WebSerial over USB is simpler and avoids CCA network configuration issues. For most instructional goals it is sufficient. Introducing Wi-Fi adds complexity that is better saved for a later project.

**Signal processing in JavaScript, not Arduino.**
Running signal processing in p5.js rather than on the microcontroller has two benefits: (1) students can see and interact with the data at each processing stage in real time, including pausing, zooming, and logging; (2) the feedback loop for tuning parameters (threshold, window size, alpha) is much shorter — no compile/upload cycle.

**ESP32 12-bit ADC.**
The ESP32's ADC produces values from 0 to 4095. The code examples use these native values. Students should be aware that the ESP32 ADC has known nonlinearity near the supply rails; keeping the sensor signal in the middle of the range (512–3500) produces more accurate readings.

**Standalone stage folders.**
Each stage's Arduino sketch and p5 sketch live in their own folder so they can be shared, downloaded, or opened directly without copying code from the README. The Stage 1 Arduino sketch (`stage_1_send_data.ino`) is the only sketch needed for Stages 1, 2, and 3 — the p5 sketches for those stages are each fully self-contained.

## Curriculum Design Questions

- How much weight should go to **physical prototyping** versus the software systems built around hardware?
- Are students actually learning the target skills when they rely heavily on AI or "vibe coding" tools? How do we assess that?
- Which should the curriculum optimize for?
  - Technical understanding
  - Creative momentum
  - Rapid experimentation

## Possible Additional Materials

- Oscilloscope-style visualization that pauses and lets students inspect individual beats
- Logged CSV data for offline analysis in Python / p5.js
- Comparison sketch: PulseSensor library output vs. this project's pipeline on the same data
- Extension: apply the same pipeline to a different sensor (microphone, light sensor, accelerometer)

## Keeping Material Current

Student tools (especially AI coding assistants) evolve quickly. Course materials, exercises, and evaluation methods should be revisited each term to stay aligned with how students actually work.
