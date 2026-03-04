// =============================================================================
// File:    sketch.js
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Stage:   1 — Raw Waveform Display
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// PURPOSE
// -------
// This is the browser half of Stage 1. It connects to the ESP32 over the
// USB cable using the WebSerial API, reads the "timestamp,value" lines that
// the Arduino sketch sends, and draws a live scrolling waveform in p5.js.
//
// No signal processing happens here — we just display whatever numbers the
// ESP32 sends, raw and unmodified.
//
// WHAT IS p5.js?
// --------------
// p5.js is a JavaScript library (a ready-made collection of code you can use)
// that makes it easy to draw shapes, lines, and animations in the browser.
// Every p5 sketch has two special functions that p5.js calls automatically:
//   setup() — runs once when the page loads, used to create the canvas
//   draw()  — runs over and over (~60 times per second), used to draw frames
//
// WHAT IS WebSerial?
// ------------------
// WebSerial is a browser feature that lets a web page talk directly to a
// device connected via USB — in our case, the ESP32. When you click
// "Connect ESP32", the browser asks you to choose a serial port from a popup
// menu. Once connected, data flows in from the ESP32 in real time.
//
// WHAT IS A BUFFER?
// -----------------
// A buffer (also called a rolling window or circular buffer) is an array with
// a fixed number of slots. When a new value arrives, it is added to the end
// and the oldest value at the front is removed. The array always contains
// exactly BUFFER_SIZE values — the most recent ones.
//
// Imagine a ticker-tape printout that is only BUFFER_SIZE characters wide:
// new characters appear on the right, and old ones fall off the left.
// When we draw the buffer as a waveform, it creates a scrolling effect.
//
// WHAT IS map()?
// --------------
// map() is a p5.js function that translates a value from one number range to
// another. For example:
//   map(rawBuffer[i], 0, 4095, height - 20, 20)
// takes a sensor value (0–4095) and converts it to a screen y-coordinate
// (20–(height-20) pixels). Large sensor values become small y coordinates
// (near the top of the canvas) because in screen coordinates y=0 is the top.

// =============================================================================
// CONSTANTS — fixed values that control the sketch's behaviour
// =============================================================================

// How many milliseconds the Arduino waits between samples.
// This must match SAMPLE_INTERVAL_MS in the Arduino sketch.
// 10 ms between samples → 1000 ms ÷ 10 ms = 100 samples per second (100 Hz).
const SAMPLE_INTERVAL_MS = 10;

// The ADC (Analog-to-Digital Converter) on the ESP32 produces integers from
// 0 (sensor at 0 V) to 4095 (sensor at 3.3 V). These constants define that
// full range so we can scale values correctly on screen.
const YMIN = 0;
const YMAX = 4095;

// The midpoint of the ADC range. (0 + 4095) / 2 = 2047.5, rounded to 2047.
// We fill the buffer with this value at startup so the initial flat line
// appears in the centre of the canvas rather than at the bottom.
const ADC_MID_SCALE = (YMIN + YMAX) / 2;

// How many samples to store and display at once.
// 500 samples × 10 ms each = 5 seconds of history visible on screen.
const BUFFER_SIZE = 500;

// The colour used to draw the raw waveform, as [Red, Green, Blue] values
// each from 0–255. [100, 200, 255] is a light blue.
const RAW_COLOR = [100, 200, 255];

// =============================================================================
// STATE — variables that change as the sketch runs
// =============================================================================

// port   — the WebSerial port object (represents the physical USB connection)
// reader — reads the incoming stream of text from that port
let port, reader;

// The rolling buffer of raw sensor values.
// new Array(BUFFER_SIZE) creates an array with 500 slots.
// .fill(ADC_MID_SCALE) sets every slot to the midpoint value (≈2048)
// so the waveform starts as a flat line in the centre.
let rawBuffer = new Array(BUFFER_SIZE).fill(ADC_MID_SCALE);

// =============================================================================
// WEBSERIAL — functions that handle the USB connection
// =============================================================================

// connectSerial() — called when the user clicks "Connect ESP32"
// 'async' means this function can pause and wait for things (like the user
// choosing a port) without freezing the rest of the browser.
async function connectSerial() {
  // Ask the browser to show the port-picker popup. The user selects the
  // ESP32 from a list of available serial ports. 'await' means "wait here
  // until the user has made a choice, then continue."
  port = await navigator.serial.requestPort();

  // Open the chosen port at 115200 baud — the same speed the Arduino uses.
  await port.open({ baudRate: 115200 });

  // The port sends raw bytes. TextDecoderStream converts those bytes into
  // readable text (UTF-8 characters like letters, digits, commas, newlines).
  const decoder = new TextDecoderStream();

  // Connect the port's byte stream to the decoder's input.
  port.readable.pipeTo(decoder.writable);

  // Get a "reader" object so we can pull decoded text out of the stream.
  reader = decoder.readable.getReader();

  // Start the loop that continuously reads incoming lines.
  readLoop();
}

// readLoop() — runs continuously in the background, reading incoming data
// It is 'async' because reading from a serial port involves waiting for data
// that arrives at unpredictable times.
async function readLoop() {
  // 'partial' holds any text that arrived but did not yet end with a newline.
  // The serial stream can split a single line across multiple read() calls,
  // so we accumulate incomplete lines here until we see a "\n".
  let partial = "";

  // Loop forever (until the port is closed or an error occurs).
  while (true) {
    // Wait for the next chunk of text to arrive from the port.
    // 'value' is the text that arrived; 'done' becomes true if the port closed.
    const { value, done } = await reader.read();

    // If the port closed, exit the loop.
    if (done) break;

    // Append the new chunk to any leftover partial text from last time.
    partial += value;

    // Split on newline characters to get individual lines.
    // For example "1234,2048\n1235,2051\n12" splits into:
    //   ["1234,2048", "1235,2051", "12"]
    const lines = partial.split("\n");

    // The last element after split("\n") is either empty (if the chunk ended
    // with a newline) or an incomplete line fragment. Either way, save it
    // for the next iteration and process only the complete lines before it.
    partial = lines.pop();

    // Process each complete line.
    for (const line of lines) {
      // Split "1234,2048" into ["1234", "2048"]
      const parts = line.trim().split(",");

      // We expect exactly 2 parts: timestamp and value.
      // (Blank lines or malformed lines are silently skipped.)
      if (parts.length === 2) {
        const ts  = parseInt(parts[0]); // timestamp in milliseconds (not used in Stage 1)
        const val = parseInt(parts[1]); // sensor reading 0–4095

        // parseInt() can return NaN (Not a Number) if the text isn't a valid
        // integer. isNaN() checks for that and skips bad values.
        if (!isNaN(val)) onNewSample(ts, val);
      }
    }
  }
}

// =============================================================================
// SIGNAL PIPELINE — processing each new sensor reading
// =============================================================================

// updateBuffer() — adds a new value to the end of a rolling buffer and
// removes the oldest value from the front. The buffer stays the same length.
//
// buf   — the array to update (passed in by reference)
// value — the new number to add
//
// push() adds to the end; shift() removes from the front.
function updateBuffer(buf, value) {
  buf.push(value);   // add new value at position [499]
  buf.shift();       // remove old value from position [0], shifting everything left
}

// onNewSample() — called once for every new "timestamp,value" pair received
//
// timestamp — milliseconds from the Arduino's clock (stored but unused here)
// raw       — the ADC reading 0–4095
function onNewSample(timestamp, raw) {
  // Store the new sample in the rolling display buffer.
  updateBuffer(rawBuffer, raw);
}

// =============================================================================
// p5.js — drawing the canvas
// =============================================================================

// setup() runs once when the page loads.
function setup() {
  // Create a drawing canvas that is 800 pixels wide and 400 pixels tall.
  // p5.js automatically adds this canvas to the web page.
  createCanvas(800, 400);

  // Use a monospace font for any text we draw (all characters same width,
  // which makes labels line up neatly).
  textFont("monospace");

  // Create a clickable button labelled "Connect ESP32" and attach it to the
  // connectSerial function so clicking it starts the serial connection.
  let btn = createButton("Connect ESP32");
  btn.mousePressed(connectSerial);
}

// draw() runs approximately 60 times per second — p5.js calls it in a loop.
// Each call redraws the entire canvas from scratch with the latest data.
function draw() {
  // Fill the whole canvas with a very dark grey (value 20 out of 255).
  // This erases the previous frame so the new one appears clean.
  background(20);

  // ── Draw the raw waveform ─────────────────────────────────────────────────

  // Set the line colour to the blue defined in RAW_COLOR.
  // The spread operator (...) unpacks [100, 200, 255] into three arguments.
  stroke(...RAW_COLOR);

  // Turn off fill — we are drawing an outline (a line), not a filled shape.
  noFill();

  // beginShape() / endShape() tell p5.js we are about to define a polyline
  // (a series of connected straight line segments).
  beginShape();

  for (let i = 0; i < rawBuffer.length; i++) {
    // Map the buffer index (0 to 499) to an x pixel position (0 to width).
    // Index 0 is the oldest sample (left edge); index 499 is the newest (right).
    let x = map(i, 0, rawBuffer.length - 1, 0, width);

    // Map the raw sensor value (0–4095) to a y pixel position.
    // IMPORTANT: on screen, y=0 is the TOP and y=height is the BOTTOM,
    // which is the opposite of a normal graph. So we swap the output range:
    //   sensor value = YMIN (0)    → y near the bottom  (height - 20)
    //   sensor value = YMAX (4095) → y near the top     (20)
    // This makes the waveform look like a normal upright graph.
    let y = map(rawBuffer[i], YMIN, YMAX, height - 20, 20);

    // Place a vertex (corner point) at this (x, y) position.
    // p5.js connects adjacent vertices with straight line segments.
    vertex(x, y);
  }

  endShape(); // finish the polyline and draw it

  // ── Label ─────────────────────────────────────────────────────────────────

  // Turn off the stroke (outline) so the text has no border around it.
  noStroke();

  // Draw the blue "RAW" label in the top-left corner of the canvas.
  fill(...RAW_COLOR);
  textSize(14);
  text("RAW", 10, 20);
}

