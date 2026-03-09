// =============================================================================
// File:    stage_1_send_data.ino
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Stage:   1 — Send Timestamped Data
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// PURPOSE
// -------
// This sketch does almost the same thing as Stage 0, but instead of printing
// just the sensor reading, it prints TWO pieces of information on each line:
//   1. A timestamp — how many milliseconds have passed since power-on
//   2. The raw sensor value — the ADC reading (0–4095)
//
// WHY DO WE NEED A TIMESTAMP?
// ----------------------------
// The browser (p5.js sketch) receives data over a USB serial connection.
// That data passes through several software layers before it arrives, which
// can introduce tiny, unpredictable delays. The timestamp lets the browser
// know exactly *when* each reading was taken on the ESP32's clock, so the
// display can stay accurate even if some packets arrive late.
//
// Note: Stages 2 and 3 use this same Arduino sketch — there are no further
// changes needed on the hardware/Arduino side after this point. All the
// interesting work from here on happens in the browser (p5.js).
//
// WHAT DOES THE OUTPUT LOOK LIKE?
// --------------------------------
// Each line sent over serial looks like this:
//
//   1234,2048
//
//   • 1234  = milliseconds since the ESP32 powered on (from millis())
//   • 2048  = raw ADC reading (0–4095, where 2048 is midpoint/half of 3.3V)
//   • ,     = comma separator so the browser can easily split the two values
//
// The browser sketch reads each line, splits it at the comma, and uses both
// values.
//
// HARDWARE CONNECTIONS
// --------------------
//   PulseSensor red    → 3.3V   (power)
//   PulseSensor black  → GND    (ground)
//   PulseSensor purple → A0     (analog signal)
//
// HOW TO USE
// ----------
// 1. Wire the sensor as shown above (same wiring as Stage 0).
// 2. Upload this sketch to the ESP32.
// 3. Open the p5.js sketch in the browser and click "Connect ESP32".
// 4. You should see a live scrolling waveform.
//    This same sketch is used for Stages 2 and 3 — no re-uploading needed.

// =============================================================================
// CONSTANTS
// =============================================================================

// The analog pin connected to the PulseSensor signal wire.
const int SENSOR_PIN = A0;

// How many milliseconds between readings: 10 ms → 100 readings per second.
const unsigned long SAMPLE_INTERVAL_MS = 10;

// =============================================================================
// STATE
// =============================================================================

// The timestamp of the last sensor reading, in milliseconds.
// We compare this to millis() each loop to know when to take the next reading.
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
// setup() — runs once at startup
// =============================================================================
void setup() {
  // Open the serial port at 115200 baud.
  // The browser's WebSerial connection must use the same baud rate.
  Serial.begin(115200);
}

// =============================================================================
// loop() — runs continuously, as fast as the processor allows
// =============================================================================
void loop() {
  // Read the current time in milliseconds since the ESP32 powered on.
  unsigned long now = millis();

  // Only take a new reading if at least SAMPLE_INTERVAL_MS have passed
  // since the last one. This is a non-blocking timer — it lets other code
  // (if any) run freely without being frozen by a delay().
  if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {

    // Record this reading's time for the next iteration's comparison.
    lastSampleTime = now;

    // Read the sensor voltage as a number from 0 (0 V) to 4095 (3.3 V).
    int rawValue = analogRead(SENSOR_PIN);

    // Print the timestamp and the sensor value on the same line, separated
    // by a comma. The browser will split on "," to get each piece.
    //
    // Example output:  24530,2183
    //   24530 = 24.530 seconds since power-on
    //   2183  = ADC reading (slightly above midpoint — sensor in ambient light)
    Serial.print(now);
    Serial.print(",");
    Serial.println(rawValue);   // println adds the newline that ends the line
  }
}

