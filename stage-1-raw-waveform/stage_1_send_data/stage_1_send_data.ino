// Stage 1 — Send Timestamped Data
// Smart Object Foundations — MDes Prototyping, CCA
//
// Reads a PulseSensor on A0 and sends "timestamp,value" lines over Serial
// at 100 Hz. The browser sketch uses the timestamp to stay in sync.
//
// This same Arduino sketch is used for Stages 2 and 3 — no further
// changes to the Arduino side are needed after this point.
//
// Hardware connections:
//   PulseSensor red    → 3.3V
//   PulseSensor black  → GND
//   PulseSensor purple → A0
//
// Each output line looks like:  1234,2048
//   1234  = milliseconds since the ESP32 powered on (millis())
//   2048  = raw ADC reading, 0–4095 (ESP32 12-bit ADC)

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
    int rawValue = analogRead(SENSOR_PIN);
    Serial.print(now);
    Serial.print(",");
    Serial.println(rawValue);
  }
}
