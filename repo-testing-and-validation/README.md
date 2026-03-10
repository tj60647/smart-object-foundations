# Repo Testing and Validation

This folder contains the automated test suite for the Smart Object Foundations project. It validates the signal-processing logic in each project stage and checks that the side quest guides are complete and structurally sound.

If you want to understand how the code works, read the `sketch.js` files in each stage folder. These tests are a companion layer — they do not replace reading the code, but they let you quickly verify that the logic behaves as expected, especially after you change something.

---

## What is in here

| File | What it tests |
|---|---|
| `tests/stage-1.test.js` | Rolling buffer management and serial-line parsing (`timestamp,value`) |
| `tests/stage-2.test.js` | Background subtraction and moving-average smoothing |
| `tests/stage-3.test.js` | Differentiation, peak detection, BPM calculation, and confidence scoring |
| `tests/sidequests.test.js` | All three side quest markdown files — existence, stage headings (SQ-0 through SQ-3), code block balance, JavaScript syntax, and topic keywords |
| `tests/sketch-compat.test.js` | All three `sketch.js` files — browser and OpenProcessing compatibility (no `require`/`import`/`module.exports`, no Node.js globals, defines `setup()` and `draw()`, calls `createCanvas()`, references `navigator.serial`, syntactically valid JavaScript) |

The tests exercise signal-processing logic that is copied from each stage's `sketch.js` into standalone JavaScript modules that can run in Node.js without a browser. These modules are **independent copies** — `sketch.js` does not import or depend on them in any way. Each `sketch.js` is fully self-contained and works as-is in OpenProcessing, the p5.js web editor, or locally via `index.html`. The modules here exist only to give Jest something to import for testing. Those modules live in this folder alongside the tests:

| Module | What it contains |
|---|---|
| `signal-stage-1.js` | `updateBuffer`, `parseSerialLine`, and constants |
| `signal-stage-2.js` | `createSignalProcessor` with `removeBackground` and `movingAverage` |
| `signal-stage-3.js` | `createSignalProcessor` with the full pipeline including `differentiate`, `detectPeak`, and `calculateBPMandConfidence` |

---

## Running the tests

You need **Node.js** (version 18 or higher) and **npm** installed. Both are free and available at [nodejs.org](https://nodejs.org).

```bash
# 1. Open a terminal and navigate to this folder
cd repo-testing-and-validation

# 2. Install the testing library (only needed the first time)
npm install

# 3. Run all tests
npm test
```

You should see output like this:

```
PASS  tests/stage-1.test.js
PASS  tests/stage-2.test.js
PASS  tests/stage-3.test.js
PASS  tests/sidequests.test.js
PASS  tests/sketch-compat.test.js

Tests: 163 passed, 5 suites
```

---

## Writing your own tests

Writing a test is a way to make your reasoning explicit. Instead of mentally simulating what a function *should* do for a given input, you write the expected output down as code and let the computer check it for you. This is especially useful when you tweak a parameter like `SMOOTH_N` or `AMPLITUDE_THRESHOLD` and want to confirm the effect.

**How to add a test to an existing file:**

Open one of the `.test.js` files in the `tests/` folder and add a `test(...)` block inside the most relevant `describe(...)` group. A test has three parts: a description, the code that exercises the function, and an `expect(...)` assertion that checks the result.

```js
test("a constant signal of 2000 produces near-zero output after warm-up", () => {
  const proc = createSignalProcessor({ baselineN: 20, smoothN: 5 });

  // Feed the same value until both windows are fully warmed up.
  let result;
  for (let i = 0; i < 25; i++) {
    const dc = proc.removeBackground(2000);
    result   = proc.movingAverage(dc);
  }

  // After warm-up the DC drift is fully removed, so the output should be 0.
  expect(result).toBeCloseTo(0, 5);
});
```

**How to create a new test file:**

Create a file anywhere in `tests/` with the name pattern `something.test.js`. Jest will discover and run it automatically the next time you run `npm test`. A minimal starting point looks like this:

```js
"use strict";

const { createSignalProcessor } = require("../signal-stage-3");

describe("My experiment", () => {
  test("describe what you expect here", () => {
    const proc = createSignalProcessor({ amplitudeThreshold: 50 });
    // ... call functions, then check results with expect(...)
  });
});
```

**Useful `expect` matchers:**

| Matcher | Use it when… |
|---|---|
| `expect(x).toBe(y)` | You want exact equality (numbers, booleans, strings) |
| `expect(x).toBeCloseTo(y, digits)` | Floating-point results that may have tiny rounding errors |
| `expect(x).toBeGreaterThan(y)` | You only care that the result is above a threshold |
| `expect(x).toBeLessThan(y)` | You only care that the result is below a threshold |
| `expect(x).toEqual(y)` | Deep equality for arrays and objects |
| `expect(x).toBeNull()` | The function should have returned `null` |
| `expect(x).not.toBeNull()` | The function should have returned something |

The full list of matchers is in the [Jest documentation](https://jestjs.io/docs/expect).
