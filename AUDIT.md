# Codebase Audit — Smart Object Foundations

Working document. Check off each item as changes are reviewed and applied.

---

## Group A — Functional / Accuracy

Things that cause silent failures or incorrect information.

- [x] **A1 — OpenProcessing / WebSerial warning** *(not an issue — finding was incorrect)*
  OpenProcessing serves sketches over HTTPS, which satisfies the browser security requirement for WebSerial. Chrome and Edge allow `navigator.serial` in that context. Confirmed working: https://openprocessing.org/sketch/2583498. The existing instructions are correct as written. The only real constraint — Chrome or Edge required — is already noted in the sketch headers.
  *No changes needed.*

- [x] **A2 — `ADC_MID_SCALE` comment is factually wrong**
  Fixed in all three sketches. Comment now explains: the ADC produces only whole numbers (0–4095, a 12-bit binary range, 2^12 = 4096 values); the true midpoint is 2047.5, a decimal that the ADC itself can never produce; JavaScript stores it fine and the 0.5 difference is invisible on screen.
  *Files: stage-1, stage-2, stage-3 sketch.js*

- [x] **A3 — Missing `isNaN` comment in Stage 3 `readLoop`**
  Fixed. Added the same explanation present in Stages 1 and 2: `parseInt()` returns NaN if the text can't be parsed as an integer (blank line, corrupted data), and `isNaN()` catches that to skip bad values rather than passing garbage downstream.
  *File: stage-3-heartbeat-detection/p5/sketch.js*

---

## Group B — Jargon

Terms or syntax that will stop a design student with no coding background.

- [x] **B1 — `O(n)` notation**
  Fixed in both Stage 2 and Stage 3 `removeBackground()`. Replaced with plain language: push/shift moves every item in the array one position — 500 items × 100 samples/second = 50,000 small steps per second, which a modern browser handles without trouble.
  *Files: stage-2-clean-signal/p5/sketch.js, stage-3-heartbeat-detection/p5/sketch.js*

- [x] **B2 — Destructuring assignment in Stage 3**
  Fixed. Added a comment at the call site explaining that the curly-brace syntax unpacks named properties from the returned object, and showing the equivalent three-line version for comparison.
  *File: stage-3-heartbeat-detection/p5/sketch.js*

- [x] **B3 — `Array.reduce()` with arrow function**
  Fixed. Both `reduce()` calls replaced with plain `for` loops. The mean loop sums all intervals and divides. The variance loop names the intermediate `diff` variable and uses `diff * diff` instead of `Math.pow`, making each step readable on its own.
  *File: stage-3-heartbeat-detection/p5/sketch.js*

- [x] **B4 — Spread operator `...` without explanation**
  Fixed by removing the spread operator entirely. All `stroke(...COLOR)` and `fill(...COLOR)` calls replaced with indexed access: `stroke(RAW_COLOR[0], RAW_COLOR[1], RAW_COLOR[2])`. No new syntax to explain.
  *Files: stage-1, stage-2, stage-3 sketch.js*

- [x] **B5 — `unsigned long` — why not `int`?**
  Fixed in both `.ino` files. Comment now explains: a regular `int` overflows after ~32 seconds; a signed `long` after ~24 days; `unsigned long` (no negative half) lasts ~49 days. If changed to `int` by mistake, timing breaks after 32 seconds in a subtle, hard-to-diagnose way.
  *Files: stage_0_wire_and_verify.ino, stage_1_send_data.ino*

- [x] **B6 — "Monotonically increasing" in Stage 3**
  Fixed. Replaced with: "A counter that goes up by 1 every time a new sample arrives and never resets."
  *File: stage-3-heartbeat-detection/p5/sketch.js*

- [x] **B7 — FIR / IIR in the Glossary**
  Fixed. Both entries (EMA and Low-pass filter) now give a plain-language description of what FIR/IIR actually means ("finite" = forgets after N samples; "infinite" = all past history with decreasing weight), note that the distinction isn't critical for this project, and link to Wikipedia for students who want to go deeper.
  *File: README.md — Glossary*

- [x] **B8 — "Photoplethysmography (PPG)" used but not defined**
  Fixed. Added a plain-language definition at first use: measuring blood volume changes optically — an LED shines light into the fingertip, a photodetector measures how much bounces back, and each heartbeat produces a small dip-then-rise in reflected light.
  *File: README.md*

- [x] **B9 — `toFixed()` not explained in Stage 3**
  Fixed. Both call sites now have comments explaining that `toFixed(n)` rounds a decimal to `n` decimal places and returns a string. The confidence line also explains the 0.0–1.0 → 0–100 conversion.
  *File: stage-3-heartbeat-detection/p5/sketch.js*

---

## Group C — Missing Context

Gaps where a student would need to look something up or guess.

- [x] **C1 — OpenProcessing never introduced**
  Fixed. Added a new "The Tools We Use" section to the README immediately after "About This Project". It introduces p5.js, OpenProcessing, and the WebSerial constraint (Chrome/Edge only), and consolidates the OpenProcessing usage note that was previously scattered across each stage.
  *File: README.md*

- [x] **C2 — "Board support" in Getting Started Checklist** *(not an issue)*
  The audience has completed Project 1 and already has board support installed. The existing parenthetical is sufficient context.
  *No changes needed.*

- [x] **C3 — Undefined "WebSerial demo sketch" in the checklist**
  Fixed. Linked directly to the existing demo sketch: https://openprocessing.org/sketch/2583498
  *File: README.md — Getting Started Checklist*

- [x] **C4 — Why `ts` is parsed but unused in Stage 1**
  Added 4-line comment above `const ts` explaining that it is parsed to keep the parsing structure identical across Stages 1, 2, and 3 — making side-by-side comparison and copying easier.
  *File: stage-1-raw-waveform/p5/sketch.js*

- [x] **C5 — `rawBuffer` vs `smoothedBuffer` initialize differently — unexplained**
  Added block comment above both buffer declarations in Stage 2 and Stage 3 explaining that `rawBuffer` uses `ADC_MID_SCALE` because the raw signal lives in 0–4095, while `smoothedBuffer` uses `0` because the cleaned signal is DC-free and centred around zero. Comment ends with "The two different fill values are intentional."
  *Files: stage-2-clean-signal/p5/sketch.js, stage-3-heartbeat-detection/p5/sketch.js*

- [x] **C6 — First-sample startup behavior of `prevSmoothed` / `prevSlope`**
  Expanded both comments to explain that initialising to `0` means the first slope check (`prevSlope > 0`) is false, so no spurious peak fires on startup. Notes both variables share the same safe-startup rationale.
  *File: stage-3-heartbeat-detection/p5/sketch.js*

- [x] **C7 — The `0.3` CV confidence threshold is an arbitrary design choice**
  Added a 5-line comment in `computeBPM()` explaining that `0.3` is a tunable dial (not a universal constant) with examples of how to adjust it. Added a "Tuning tip" callout block in README Stage 3c pointing students to `cv / 0.3` in the sketch.
  *Files: README.md — Stage 3c, stage-3-heartbeat-detection/p5/sketch.js*

---

## Group D — Structure / Organization

Structural choices that affect how easily students can navigate the material.

- [x] **D1 — Getting Started Checklist is buried at the bottom of the README**
  Added a "Ready to start?" callout block at the end of the About This Project intro paragraph, linking directly to the `#getting-started-checklist` anchor. First-timers now see the link before any concept material.
  *File: README.md*

- [ ] **D2 — "Skill check" vs "Deliverable" labels are inconsistent**
  Stage 0 ends with "Skill check:"; Stages 1, 2, and 3 end with "Deliverable:". They serve the same purpose but use different names. Pick one and use it consistently.
  *File: README.md*

- [ ] **D3 — EMA explanation appears twice in the README**
  Nearly identical wording appears in the Background Subtraction sidebar and again in the Low-pass/High-pass Filters sidebar. This is arguably reinforcement, but a student reading linearly may stop and wonder if they missed something important between the two appearances.
  *File: README.md*

- [ ] **D4 — `async`/`await` explanation exists only in Stage 1**
  Stages 2 and 3 use identical async patterns in `connectSerial()` / `readLoop()` but carry no explanation. Each stage is described as standalone, so a first-time Stage 3 user who skips Stages 1 and 2 has no context for how async works.
  *Files: stage-2-clean-signal/p5/sketch.js, stage-3-heartbeat-detection/p5/sketch.js*

- [ ] **D5 — Y-axis coordinate flip only explained inside `draw()`, not in the header**
  The fact that `y=0` is the top of the canvas (not the bottom) — and that this requires swapping the output range in `map()` — is one of the most reliably confusing things for students new to canvas graphics. It is explained inside the `draw()` loop comments but not in the sketch header where a student reads first.
  *File: stage-1-raw-waveform/p5/sketch.js (and could be reinforced in stages 2 and 3)*

- [ ] **D6 — `Math.pow(b - mean, 2)` vs `(b - mean) ** 2`**
  Readability-only: `(b - mean) ** 2` reads more naturally as "b minus mean, squared." `Math.pow()` is not wrong but is more verbose. Given the audience, the shorter form with a comment ("** means 'to the power of'") would be clearer.
  *File: stage-3-heartbeat-detection/p5/sketch.js*
