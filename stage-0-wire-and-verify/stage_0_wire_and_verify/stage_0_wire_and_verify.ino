// Stage 0 — Wire Up and Verify
// Smart Object Foundations — MDes Prototyping, CCA
//
// Reads a PulseSensor on A0 and prints raw ADC values to the Serial Plotter.
// No external libraries needed.
//
// Hardware connections:
//   PulseSensor red    → 3.3V
//   PulseSensor black  → GND
//   PulseSensor purple → A0
//
// After uploading, open Tools → Serial Plotter at 115200 baud.
// Place your fingertip on the sensor — you should see a rhythmic wave
// that rises and falls with each heartbeat.

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
