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

## Stage 0 — Wire Up and Verify

Connect the PulseSensor to your ESP32 and confirm the analog signal exists before writing any processing code.

**Hardware connections:**

| PulseSensor wire | ESP32 v2 pin |
|---|---|
| Red (power) | 3.3V |
| Black (ground) | GND |
| Purple (signal) | A0 (or any analog-capable pin) |

**Arduino sketch — minimum viable sampler:**

```cpp
// Stage 0: read raw sensor, print at steady rate
// No libraries needed.

const int SENSOR_PIN = A0;
const unsigned long SAMPLE_INTERVAL_MS = 10; // 100 samples/sec
unsigned long lastSampleTime = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  unsigned long now = millis();
  if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = now;
    int rawValue = analogRead(SENSOR_PIN); // 0–4095 on ESP32 (12-bit ADC)
    Serial.println(rawValue);
  }
}
```

Open the **Arduino Serial Plotter** (`Tools → Serial Plotter`, baud rate 115200). Place your fingertip on the sensor. You should see a rhythmic wave that rises and falls with each heartbeat.

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

Update your Arduino sketch to send both a timestamp and the sensor value on each line:

```cpp
// Stage 1: send timestamp,value pairs
const int SENSOR_PIN = A0;
const unsigned long SAMPLE_INTERVAL_MS = 10;
unsigned long lastSampleTime = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  unsigned long now = millis();
  if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = now;
    int rawValue = analogRead(SENSOR_PIN);
    Serial.print(now);
    Serial.print(",");
    Serial.println(rawValue);
  }
}
```

Each line looks like: `1234,2048`

### 1b — Receive and display in p5.js

```javascript
// Stage 1 p5.js sketch — raw waveform display
// Paste into OpenProcessing. Requires Chrome or Edge for WebSerial.

const SAMPLE_INTERVAL_MS = 10; // must match Arduino sketch (100 Hz)
const YMIN = 0, YMAX = 4095;   // ESP32 12-bit ADC range
const ADC_MID_SCALE = (YMIN + YMAX) / 2; // 2047.5 — nominal midpoint

let port, reader;
let rawBuffer = new Array(500).fill(ADC_MID_SCALE); // pre-fill with mid-scale value

async function connectSerial() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  const decoder = new TextDecoderStream();
  port.readable.pipeTo(decoder.writable);
  reader = decoder.readable.getReader();
  readLoop();
}

async function readLoop() {
  let partial = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    partial += value;
    const lines = partial.split("\n");
    partial = lines.pop();          // keep any incomplete line
    for (const line of lines) {
      const parts = line.trim().split(",");
      if (parts.length === 2) {
        const ts  = parseInt(parts[0]);
        const val = parseInt(parts[1]);
        if (!isNaN(val)) onNewSample(ts, val);
      }
    }
  }
}

function onNewSample(timestamp, raw) {
  rawBuffer.push(raw);
  rawBuffer.shift();        // keep fixed length — this is a circular/rolling buffer
}

function setup() {
  createCanvas(800, 400);
  let btn = createButton("Connect ESP32");
  btn.mousePressed(connectSerial);
}

function draw() {
  background(20);

  // Draw raw waveform
  stroke(100, 200, 255);
  noFill();
  beginShape();
  for (let i = 0; i < rawBuffer.length; i++) {
    let x = map(i, 0, rawBuffer.length - 1, 0, width);
    let y = map(rawBuffer[i], YMIN, YMAX, height - 20, 20);
    vertex(x, y);
  }
  endShape();

  fill(255);
  noStroke();
  text("RAW", 10, 20);
}
```

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

You will remove both in the browser.

### 2a — Background subtraction

A **baseline** is a slowly-updating average of the signal. When you subtract it from each sample, you remove the slow drift and center the waveform around zero. The result is a "DC-free" signal where the interesting heartbeat peaks stand out above a flat baseline.

```javascript
// Add to your p5.js sketch (Stage 2a)

let baseline = ADC_MID_SCALE;     // start at mid-scale; will adapt quickly
const BASELINE_ALPHA = 0.002;     // how fast the baseline tracks the signal
                                  // smaller = slower = removes lower frequencies

let dcFreeBuffer = new Array(500).fill(0);

// Helper: push a value into a fixed-length rolling buffer
function updateBuffer(buf, value) {
  buf.push(value);
  buf.shift();
}

function removeBackground(raw) {
  // Exponential moving average — a simple IIR low-pass filter
  baseline += BASELINE_ALPHA * (raw - baseline);
  return raw - baseline;         // center around zero
}
```

> **📐 Concept Sidebar: Background Subtraction**
>
> Every sensor has a **background level** — an offset or drift that has nothing to do with the signal you care about. A photodetector sitting in ambient light, a microphone in a noisy room, a pressure sensor with a static reading — all have backgrounds.
>
> **Background subtraction** is the process of estimating that background and removing it. The simplest approach is an exponential moving average (EMA): keep a running estimate that slowly tracks the signal, then subtract it.
>
> `baseline = baseline + α (alpha) × (new_sample - baseline)`
>
> The parameter α (alpha) controls how quickly the baseline tracks the signal:
> - α close to 1 → baseline tracks fast → removes nearly everything, including your signal
> - α close to 0 → baseline tracks very slowly → only removes slow drift, leaves heartbeat shape intact
>
> For a 100 Hz signal where heartbeats are ~1 Hz, α = 0.002 means the baseline **time constant** (the time for the average to close ~63% of the gap to a new level) is approximately 1/(α × sampleRate) ≈ 5 seconds (this approximation holds for small α). That is slow enough to follow posture changes but fast enough to adapt over time.

### 2b — Smoothing with a moving average (integration)

After background subtraction, the signal still has sample-to-sample jitter. A **moving average** averages the last N samples together, which blurs out fast noise while preserving slower, larger features like heartbeat peaks.

```javascript
// Add to your p5.js sketch (Stage 2b)

let smoothWindow = [];
const SMOOTH_N = 15;              // average over 15 samples = 150 ms at 100 Hz

let smoothedBuffer = new Array(500).fill(0);

function movingAverage(value) {
  smoothWindow.push(value);
  if (smoothWindow.length > SMOOTH_N) smoothWindow.shift();
  let sum = 0;
  for (let v of smoothWindow) sum += v;
  return sum / smoothWindow.length;
}
```

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

### 2c — Draw both signals

Add a second trace to your p5.js sketch showing the cleaned signal below (or alongside) the raw signal:

```javascript
// Updated draw() for Stage 2
// Define color constants at the top of your sketch (add these near your other constants):
//   const RAW_COLOR      = [100, 200, 255];
//   const SMOOTHED_COLOR = [255, 180,  50];

function draw() {
  background(20);

  let halfH = height / 2;

  // Top half: raw signal
  stroke(...RAW_COLOR);
  noFill();
  beginShape();
  for (let i = 0; i < rawBuffer.length; i++) {
    let x = map(i, 0, rawBuffer.length - 1, 0, width);
    let y = map(rawBuffer[i], YMIN, YMAX, halfH - 10, 10);
    vertex(x, y);
  }
  endShape();

  // Bottom half: smoothed DC-free signal (centered around halfH)
  stroke(...SMOOTHED_COLOR);
  noFill();
  beginShape();
  for (let i = 0; i < smoothedBuffer.length; i++) {
    let x = map(i, 0, smoothedBuffer.length - 1, 0, width);
    let y = map(smoothedBuffer[i], -500, 500, height - 10, halfH + 10);
    vertex(x, y);
  }
  endShape();

  fill(...RAW_COLOR);      noStroke(); text("RAW",      10, 15);
  fill(...SMOOTHED_COLOR);            text("SMOOTHED", 10, halfH + 15);
}
```

Update `onNewSample` to run the processing pipeline using the `updateBuffer` helper:

```javascript
function onNewSample(timestamp, raw) {
  updateBuffer(rawBuffer, raw);

  let dc   = removeBackground(raw);
  let sm   = movingAverage(dc);

  updateBuffer(smoothedBuffer, sm);
}
```

**Deliverable:** Two waveforms side-by-side. The bottom one should be centered on zero, smoother, and free of slow drift.

---

## Stage 3 — Heartbeat Detection with Confidence

With a clean signal in hand, you can now detect peaks. Each peak corresponds to one heartbeat.

### 3a — Differentiation: finding rises and falls

The **derivative** (rate of change) of a signal tells you whether it is going up or down at each moment. A heartbeat peak is where the signal transitions from rising to falling — i.e., where the derivative crosses zero from positive to negative.

```javascript
// Add to your p5.js sketch (Stage 3a)

let prevSmoothed = 0;

function differentiate(smoothed) {
  let slope = smoothed - prevSmoothed;   // first difference = discrete derivative
  prevSmoothed = smoothed;
  return slope;
}
```

> **📐 Concept Sidebar: Differentiation**
>
> **Differentiation** measures how fast a signal is changing. The continuous derivative is dy/dt — the slope of the curve at each instant. In discrete (sampled) signals, you approximate it with the **first difference**: `slope[n] = signal[n] - signal[n-1]`.
>
> The derivative of a smooth bell-shaped heartbeat peak looks like an S-curve: positive (rising slope) before the peak, zero at the top, negative (falling slope) after it. Detecting the **zero crossing** from positive to negative gives you the precise timing of the peak.
>
> Differentiation amplifies noise — any jitter in the signal becomes large, fast swings in the derivative. This is why you must smooth the signal *before* differentiating.

### 3b — Peak detection with a threshold

A zero crossing alone is not enough — noise creates many small zero crossings. Add an **amplitude threshold**: only declare a peak if the smoothed signal is above a minimum height.

```javascript
// Add to your p5.js sketch (Stage 3b)

let prevSlope = 0;
let peakSampleCounts = []; // sample-count index when each peak was detected
const MAX_PEAKS_STORED = 12;
const AMPLITUDE_THRESHOLD = 80; // applies to the DC-free smoothed signal (not raw ADC values)
                                 // after background subtraction the signal is centered near 0;
                                 // heartbeat peaks typically rise 50–300 units above that center
                                 // start at 80 and adjust: lower if beats are missed, higher if noise triggers false peaks

// sampleCount increments by 1 for every call to onNewSample
// (declare this near your other global variables)
let sampleCount = 0;

function detectPeak(smoothedValue, slope) {
  // Zero crossing: slope just went from positive to negative (or zero)
  let isPeakZeroCrossing = (prevSlope > 0 && slope <= 0);
  // Amplitude gate: signal must be above baseline noise
  let isAboveThreshold = (smoothedValue > AMPLITUDE_THRESHOLD);

  if (isPeakZeroCrossing && isAboveThreshold) {
    peakSampleCounts.push(sampleCount); // record which sample this peak belongs to
    if (peakSampleCounts.length > MAX_PEAKS_STORED) peakSampleCounts.shift();
  }

  prevSlope = slope;
}
```

> **📐 Concept Sidebar: Pattern Matching**
>
> Peak detection is a simple form of **pattern matching** — you are looking for a specific shape in a time series: a value that is above a threshold *and* at which the signal transitions from rising to falling.
>
> More sophisticated pattern matching looks for longer templates: you define a "prototype heartbeat shape" and slide it across the signal looking for high correlation. This is how ECG systems detect arrhythmias — they match the incoming signal against libraries of known waveform patterns.
>
> For a photoplethysmography (PPG) sensor like the PulseSensor, simple peak detection is usually sufficient because the heartbeat waveform is relatively consistent in shape.

### 3c — BPM and confidence value

Once you have a list of peak sample counts, calculate the **inter-beat interval (IBI)** — the number of samples between consecutive peaks multiplied by the sample interval gives the time in ms. BPM is 60,000 ms divided by the average IBI.

Using sample counts instead of wall-clock timestamps avoids a subtle bug: the browser's `millis()` and the Arduino's `millis()` are two unrelated clocks that start at different times. Tracking which sample index each peak belongs to keeps everything in the same coordinate system.

**Confidence** measures how consistent the intervals are. If every beat is the same distance apart, confidence is high. If the intervals are wildly variable (motion artifact, finger movement), confidence is low.

```javascript
// Add to your p5.js sketch (Stage 3c)

function calculateBPMandConfidence() {
  if (peakSampleCounts.length < 3) {
    return { bpm: 0, confidence: 0 };
  }

  // Compute inter-beat intervals (IBI) in milliseconds, using sample counts
  let intervals = [];
  for (let i = 1; i < peakSampleCounts.length; i++) {
    let samplesBetween = peakSampleCounts[i] - peakSampleCounts[i - 1];
    intervals.push(samplesBetween * SAMPLE_INTERVAL_MS);
  }

  let n = intervals.length;
  let mean = intervals.reduce((a, b) => a + b, 0) / n;
  let bpm  = 60000 / mean;

  // Standard deviation of intervals
  let variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  let stdDev   = Math.sqrt(variance);

  // Coefficient of variation (CV): stdDev / mean, expressed 0–1
  // CV = 0 → perfectly regular; CV = 1 → completely random
  let cv = stdDev / mean;

  // Map CV to a 0–1 confidence score (lower CV = higher confidence)
  // Clamp to reasonable range: CV above 0.3 is unreliable for heart rate
  let confidence = Math.max(0, 1 - cv / 0.3);

  return { bpm, confidence };
}
```

### 3d — Display everything

Update `onNewSample` and `draw()` to run the full pipeline and show the result:

```javascript
// Full onNewSample pipeline
function onNewSample(timestamp, raw) {
  sampleCount++;                  // increment before processing so peaks get the right index
  updateBuffer(rawBuffer, raw);

  let dc     = removeBackground(raw);
  let sm     = movingAverage(dc);
  updateBuffer(smoothedBuffer, sm);

  let slope  = differentiate(sm);
  detectPeak(sm, slope);          // detectPeak uses sampleCount, not the Arduino timestamp
}

// Confidence display thresholds (0–1 scale)
const CONFIDENCE_HIGH = 0.7;
const CONFIDENCE_MED  = 0.4;

// Full draw()
// (Assumes RAW_COLOR, SMOOTHED_COLOR constants are defined at sketch top)
function draw() {
  background(20);
  let halfH = height / 2;

  // Top: raw
  stroke(...RAW_COLOR); noFill();
  beginShape();
  for (let i = 0; i < rawBuffer.length; i++) {
    let x = map(i, 0, rawBuffer.length - 1, 0, width);
    let y = map(rawBuffer[i], YMIN, YMAX, halfH - 10, 10);
    vertex(x, y);
  }
  endShape();

  // Bottom: smoothed
  stroke(...SMOOTHED_COLOR); noFill();
  beginShape();
  for (let i = 0; i < smoothedBuffer.length; i++) {
    let x = map(i, 0, smoothedBuffer.length - 1, 0, width);
    let y = map(smoothedBuffer[i], -500, 500, height - 10, halfH + 10);
    vertex(x, y);
  }
  endShape();

  // Mark detected peaks on the smoothed trace.
  // Each peak's x position = how many samples ago it was, mapped to canvas width.
  // Using sample counts keeps everything in the same coordinate system as the buffers.
  stroke(255, 80, 80);
  for (let ps of peakSampleCounts) {
    let samplesAgo = sampleCount - ps;
    if (samplesAgo >= 0 && samplesAgo < rawBuffer.length) {
      let x = map(rawBuffer.length - samplesAgo, 0, rawBuffer.length - 1, 0, width);
      line(x, halfH + 10, x, height - 10);
    }
  }

  // BPM and confidence readout
  let { bpm, confidence } = calculateBPMandConfidence();
  noStroke();
  textSize(14);
  fill(...RAW_COLOR);      text("RAW",      10, 15);
  fill(...SMOOTHED_COLOR); text("SMOOTHED", 10, halfH + 15);
  fill(255);
  textSize(28);
  text(bpm > 0 ? `${bpm.toFixed(0)} BPM` : "-- BPM", width - 200, 40);
  textSize(14);
  let confPct = (confidence * 100).toFixed(0);
  if      (confidence >= CONFIDENCE_HIGH) fill(80,  255, 80);
  else if (confidence >= CONFIDENCE_MED)  fill(255, 200, 0);
  else                                    fill(255, 80,  80);
  text(`Confidence: ${confPct}%`, width - 200, 60);
}
```

**Deliverable:** Two stacked waveforms. Red vertical tick marks appear on the smoothed trace at each detected peak. The top-right corner shows BPM and a green/yellow/red confidence readout.

---

## Getting Started Checklist

*(You already have the Arduino IDE and ESP32 board support installed from Project 1.)*

- [ ] Wire up the PulseSensor (signal → A0, power → 3.3V, GND → GND)
- [ ] Upload the Stage 0 sketch — confirm the waveform in the Arduino Serial Plotter
- [ ] Update to the Stage 1 sketch (add timestamp) — confirm `ts,value` lines in Serial Monitor
- [ ] Open a WebSerial demo sketch in OpenProcessing (Chrome or Edge), connect your ESP32
- [ ] Build the Stage 1 p5.js sketch — confirm scrolling raw waveform
- [ ] Add Stage 2 processing — confirm the smoothed, DC-free waveform appears below
- [ ] Add Stage 3 detection — tune `AMPLITUDE_THRESHOLD` until peaks are detected reliably
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
A weighted moving average in which more recent samples receive more weight. Updated with `ema = ema + α × (new_value - ema)`. The parameter α (alpha) controls how quickly the average responds to changes.

**IBI (Inter-Beat Interval)**
The time in milliseconds between two consecutive heartbeat peaks. The inverse of heart rate: BPM = 60,000 / IBI.

**Integration**
In signal processing, accumulating (summing) a signal over time. A moving average is a form of integration. Integration smooths out high-frequency noise (a low-pass filter effect).

**Low-pass filter**
A filter that passes low-frequency content and attenuates high-frequency content. A moving average is a simple low-pass filter. Used here to smooth the raw sensor signal.

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
