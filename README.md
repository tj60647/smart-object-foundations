## Introduction

This collection of tutorials and resources is designed to give students hands-on experience building **Smart Objects**—physical devices that connect to software systems (such as p5.js or the web) and appear responsive, intelligent, or knowledgeable. The goal is to guide students through a specific technology stack so they can learn core concepts in sensing, data transmission, and data processing.

Students will work with an **ESP32 v2** and the **Arduino IDE**, connect the device to a computer using **WebSerial**, and send sensor data to **p5.js/OpenProcessing** for visualization and analysis. The central example will be a **pulse sensor heart-rate monitor**, which students can expand into more expressive or interactive systems.

The tutorials focus on developing practical skills in sensing, sampling, data formatting, serial communication, visualization, and signal processing. 

---

# Tutorial and Resource Topics

## 1. Core Project: Pulse Sensor Heartbeat Monitor

The central example project will be a **pulse detection system** using the PulseSensor.

Students will:

* Read analog pulse data from a PulseSensor using an ESP32
* Transmit data through serial communication
* Send data to a browser using WebSerial
* Visualize and analyze the signal in p5.js/OpenProcessing
* Detect and display heartbeat events

This example forms a base that students can extend into more complex smart objects.

Key concepts:

* Analog sensing
* Signal sampling
* Serial communication
* Real-time visualization
* Basic signal processing

---

## 2. Arduino / ESP32 Fundamentals

Students need a working foundation in the Arduino environment and ESP32 hardware.

Topics:

* Arduino IDE workflow
* Basic Arduino sketch structure

  * setup()
  * loop()
* Analog input with ESP32
* Sampling sensors with `analogRead()`
* Sampling rates and timing considerations
* Techniques for consistent sampling
* Formatting serial data output
* Using the Arduino Serial Plotter for debugging signals

Possible tutorial:

* **How to dissect an Arduino sketch**

  * Understanding libraries
  * Understanding data flow
  * Understanding timing

---

## 3. Serial Communication and WebSerial

Students will learn how sensor data moves from hardware to the browser.

Topics:

* Serial communication basics
* Data formatting for reliable transmission
* Debugging serial output
* WebSerial in the browser
* Connecting ESP32 to a computer via WebSerial
* Parsing serial data in JavaScript

Example demos:

WebSerial Arduino examples
[https://openprocessing.org/sketch/2576473](https://openprocessing.org/sketch/2576473)
[https://openprocessing.org/sketch/2583498](https://openprocessing.org/sketch/2583498)
[https://openprocessing.org/sketch/2584328](https://openprocessing.org/sketch/2584328)

Learning goals:

* Understand the data pipeline from microcontroller → browser
* Build simple serial protocols
* Parse incoming data streams

---

## 4. Data Visualization in p5.js / OpenProcessing

Once data reaches the browser, students will visualize it in real time.

Topics:

* Receiving WebSerial data in p5.js
* Buffering and storing incoming samples
* Drawing time-series graphs
* Creating responsive visualizations
* Designing readable sensor displays

Core example:

* Real-time pulse waveform display
* Heartbeat indicator visualization

---

## 5. Data Processing and Signal Analysis

Students will perform basic signal processing to extract meaningful information from sensor data.

Topics:

* Moving averages (integration / smoothing)
* Rate of change (differential)
* Standard deviation
* Peak detection
* Extracting heartbeats from pulse data
* Noise reduction

Outcome:

* Turning raw analog data into meaningful events (heartbeat detection)

---

## 6. Expressive Outputs: Light and Sound

Students can extend sensor data into expressive systems.

Examples:

* Light responses to pulse data
* Sound responses to heartbeat patterns
* "Colloquy of mobiles" style interactive objects

Focus:

* Mapping sensor data to media outputs
* Creating responsive physical systems

---

## 7. Networking and Alternative Architectures

Possible extension topics.

MQTT example:

[https://openprocessing.org/sketch/2203435](https://openprocessing.org/sketch/2203435)

Discussion points:

* MQTT messaging systems
* Cloud-connected devices
* Web-based device communication

Open question:

* Whether introducing WiFi networking on ESP32 is worth the complexity in the course environment (CCA network, configuration overhead, reliability).

Possible decision:

* WebSerial + p5.js may be sufficient for most instructional goals.

---

## 8. Smart Object Design

Students will ultimately build a **Smart Object**.

Definition:

A physical device that uses sensors, computation, and web connectivity to appear intelligent, reactive, or knowledgeable.

Examples for inspiration:

[https://enchantedobjects.com/](https://enchantedobjects.com/)

Possible project directions:

* Health or biofeedback devices
* Responsive environments
* Expressive data objects
* Interactive storytelling devices

---

## 9. AI and Inquiry Tools

Potential additions to the course workflow.

Ideas:

* NotebookLM or similar tools for research
* Agents for helping interpret sensor data
* "Questions to ask" frameworks for debugging and exploration

---

## 10. Pedagogical Questions

Open questions for instructors:

* How much emphasis should be placed on **physical prototyping** versus software systems built around hardware?
* Are students learning the intended skills when they rely heavily on **AI or “vibe coding”** tools?
* Should the curriculum prioritize:

  * technical understanding
  * creative momentum
  * rapid experimentation?

Related challenge:

Keeping course material, exercises, and evaluation methods aligned with rapidly evolving tools students are using.

* a **student-facing tutorial roadmap**
* a **step-by-step pulse sensor lab sequence** (which would probably make the strongest core unit).
