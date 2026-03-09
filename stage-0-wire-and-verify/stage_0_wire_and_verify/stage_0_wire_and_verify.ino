// =============================================================================
// File:    stage_0_wire_and_verify.ino
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Stage:   0 — Wire Up and Verify
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// PURPOSE
// -------
// This is the very first sketch. Its only job is to confirm that the hardware
// is wired correctly and that numbers are flowing from the sensor to the
// computer. No signal processing happens here — we just read the sensor and
// print the raw number so you can see it on the screen.
//
// WHAT IS AN ADC?
// ---------------
// The PulseSensor outputs a varying *voltage* — the brighter the light that
// bounces back from your fingertip, the higher the voltage it sends.
// But a microcontroller like the ESP32 can only work with *numbers*, not
// voltages directly. The ADC (Analog-to-Digital Converter) is a built-in
// circuit inside the ESP32 that measures the voltage and converts it to a
// number. On the ESP32 this is a 12-bit ADC, meaning the output is always
// an integer between 0 and 4095:
//   0    → lowest voltage (0 V — sensor nearly off)
//   4095 → highest voltage (3.3 V — sensor at full output)
// Numbers in between represent proportional voltages.
//
// WHAT IS SERIAL?
// ---------------
// "Serial" refers to sending data one bit at a time over a wire — in this
// case, the USB cable connecting the ESP32 to your computer. When we call
// Serial.println(), we are sending a line of text to the Arduino IDE's
// Serial Plotter or Serial Monitor, where you can read or graph it.
//
// WHAT IS THE BAUD RATE?
// ----------------------
// Baud rate is the speed of the serial connection — how many bits are sent
// per second. We use 115200 baud. The number must match between the sketch
// (Serial.begin) and the Serial Monitor / Plotter setting in the Arduino IDE.
//
// HOW FAST DO WE SAMPLE?
// -----------------------
// We take one reading every 10 milliseconds, which is 100 readings per second
// (100 Hz). A heartbeat lasts about 1 second, so 100 readings per heartbeat
// gives us plenty of detail to see the waveform clearly.
//
// The code uses a NON-BLOCKING timer pattern: instead of using delay(10),
// which would freeze everything, we check the clock each time loop() runs
// and only take a reading when enough time has passed. This is important in
// more complex sketches where you don't want to stall other work.
//
// HARDWARE CONNECTIONS
// --------------------
//   PulseSensor red    → 3.3V   (power — gives the sensor its operating voltage)
//   PulseSensor black  → GND    (ground — completes the electrical circuit)
//   PulseSensor purple → A0     (analog signal — the varying voltage we read)
//
// HOW TO USE
// ----------
// 1. Wire the sensor as shown above.
// 2. Upload this sketch to the ESP32 using the Arduino IDE.
// 3. Open Tools → Serial Plotter (or Serial Monitor) at 115200 baud.
// 4. Place your fingertip gently on the sensor.
// 5. You should see a wave that rises and falls with each heartbeat.
//    If the signal is flat or noisy, check your wiring.

// =============================================================================
// CONSTANTS — values that never change while the program runs
// =============================================================================

// Which analog pin is the sensor wired to.
// On the ESP32, A0 maps to GPIO 36 (or VP depending on your board variant).
const int SENSOR_PIN = A0;

// How many milliseconds between readings.
// 10 ms = 0.01 seconds → 100 readings per second (100 Hz).
const unsigned long SAMPLE_INTERVAL_MS = 10;

// =============================================================================
// STATE — variables that track what is happening between loop() calls
// =============================================================================

// Records the time (in milliseconds since power-on) of the last sensor
// reading. millis() is a built-in Arduino function that counts up from zero
// the moment the ESP32 starts. Comparing the current time to the last sample
// time lets us know when 10 ms have passed.
//
// WHY unsigned long AND NOT int?
// millis() counts up without stopping. A regular int on Arduino is a 16-bit
// signed number with a maximum value of 32,767 — that overflows after only
// about 32 seconds of run time. A regular long is 32-bit signed and overflows
// after about 24 days. unsigned long is 32-bit but has no negative side, so
// its maximum is 4,294,967,295 ms — about 49 days. That is more than enough
// for any project session. If you change this to int by mistake, the timing
// will break after ~32 seconds in a subtle, hard-to-diagnose way.
unsigned long lastSampleTime = 0;

// =============================================================================
// setup() — runs ONCE when the ESP32 powers on or resets
// =============================================================================
void setup() {
  // Start the serial connection at 115200 bits per second.
  // This must match the baud rate you select in the Serial Plotter / Monitor.
  Serial.begin(115200);
}

// =============================================================================
// loop() — runs REPEATEDLY, as fast as possible, forever
// =============================================================================
void loop() {
  // millis() returns how many milliseconds have elapsed since power-on.
  // We store it in 'now' so we only call millis() once per loop iteration.
  unsigned long now = millis();

  // Has at least SAMPLE_INTERVAL_MS (10 ms) passed since the last reading?
  // If not, we do nothing and loop() immediately runs again.
  // This is the non-blocking timer pattern mentioned in the header.
  if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {

    // Remember when this reading happened so we can check timing next time.
    lastSampleTime = now;

    // Read the sensor. analogRead() triggers the ADC and returns a number
    // between 0 and 4095. The reading takes only a few microseconds.
    int rawValue = analogRead(SENSOR_PIN);

    // Send the number to the computer followed by a newline character.
    // The Serial Plotter reads one number per line and graphs them in order.
    Serial.println(rawValue);
  }
}

