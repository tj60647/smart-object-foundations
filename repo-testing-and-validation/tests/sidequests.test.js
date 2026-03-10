// =============================================================================
// File:    tests/sidequests.test.js
// Project: Smart Object Foundations — MDes Prototyping, CCA
// Side Quests — Bluetooth Streaming, Browser-to-ESP32, WiFi + AI Haptics
//
// Authors: Copilot
//          Thomas J McLeish
// License: MIT — see LICENSE in the root of this repository
// =============================================================================
//
// Tests for the three side quest markdown files.
// Each side quest is a self-contained guide with four stages (SQ-0 through SQ-3)
// and interleaved code blocks covering Arduino C++ and JavaScript.
//
// These tests validate:
//   • Files exist and are non-empty
//   • Each file contains the four expected stage headings (SQ-0 … SQ-3)
//   • Code blocks (``` fences) are balanced (even count → all opened blocks close)
//   • JavaScript code blocks contain syntactically valid JavaScript
//   • Each file covers the expected combination of languages and APIs

"use strict";

const fs   = require("fs");
const path = require("path");

// ROOT points two levels up from this file (repo-testing-and-validation/tests/)
// to the repository root where the side quest markdown files live.
const ROOT = path.resolve(__dirname, "../..");

const SIDEQUEST_FILES = {
  bluetooth: path.join(ROOT, "side-quest-bluetooth-streaming.md"),
  browser:   path.join(ROOT, "side-quest-browser-to-esp32.md"),
  wifi:      path.join(ROOT, "side-quest-wifi-haptic.md"),
};

// Helper: read a file as a string (throws if the file does not exist).
function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

// Helper: extract all fenced code blocks of a given language tag from markdown.
// Returns an array of strings — one per block — without the fence lines.
// If lang is '' (empty string), returns blocks with no language tag.
// If lang is null, returns ALL blocks regardless of tag.
function extractCodeBlocks(markdown, lang) {
  const blocks = [];
  const lines  = markdown.split("\n");
  let insideBlock = false;
  let currentLang = null;
  let currentLines = [];

  for (const line of lines) {
    if (!insideBlock) {
      const fenceMatch = line.match(/^```(\w*)/);
      if (fenceMatch) {
        insideBlock  = true;
        currentLang  = fenceMatch[1]; // '' for plain ```, 'js' for ```js, etc.
        currentLines = [];
      }
    } else {
      if (line.startsWith("```")) {
        // Closing fence.
        const matchesFilter =
          lang === null ||
          currentLang === lang;

        if (matchesFilter) blocks.push(currentLines.join("\n"));
        insideBlock  = false;
        currentLang  = null;
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
  }

  return blocks;
}

// Helper: count how many times a regex matches in a string.
function countMatches(str, regex) {
  return (str.match(regex) || []).length;
}

// =============================================================================
// File existence and size
// =============================================================================

describe("Side quests — file existence", () => {
  test("side-quest-bluetooth-streaming.md exists", () => {
    expect(fs.existsSync(SIDEQUEST_FILES.bluetooth)).toBe(true);
  });

  test("side-quest-browser-to-esp32.md exists", () => {
    expect(fs.existsSync(SIDEQUEST_FILES.browser)).toBe(true);
  });

  test("side-quest-wifi-haptic.md exists", () => {
    expect(fs.existsSync(SIDEQUEST_FILES.wifi)).toBe(true);
  });

  test("side-quest-bluetooth-streaming.md is non-empty (> 1 KB)", () => {
    const size = fs.statSync(SIDEQUEST_FILES.bluetooth).size;
    expect(size).toBeGreaterThan(1024);
  });

  test("side-quest-browser-to-esp32.md is non-empty (> 1 KB)", () => {
    const size = fs.statSync(SIDEQUEST_FILES.browser).size;
    expect(size).toBeGreaterThan(1024);
  });

  test("side-quest-wifi-haptic.md is non-empty (> 1 KB)", () => {
    const size = fs.statSync(SIDEQUEST_FILES.wifi).size;
    expect(size).toBeGreaterThan(1024);
  });
});

// =============================================================================
// Stage headings (SQ-0 through SQ-3)
// =============================================================================

describe("Side quests — stage headings", () => {
  for (const [name, filePath] of Object.entries(SIDEQUEST_FILES)) {
    describe(`${name}`, () => {
      let content;
      beforeAll(() => { content = read(filePath); });

      for (const stage of ["SQ-0", "SQ-1", "SQ-2", "SQ-3"]) {
        test(`contains a heading for ${stage}`, () => {
          expect(content).toMatch(new RegExp(`^## ${stage}`, "m"));
        });
      }
    });
  }
});

// =============================================================================
// Code block balance (every opening fence has a closing fence)
// =============================================================================

describe("Side quests — code block balance", () => {
  for (const [name, filePath] of Object.entries(SIDEQUEST_FILES)) {
    test(`${name}: code fences are balanced (even number of fence markers)`, () => {
      const content = read(filePath);
      const fenceCount = countMatches(content, /^```/gm);
      expect(fenceCount % 2).toBe(0);
    });
  }
});

// =============================================================================
// Code block presence (each file has code for its topic)
// =============================================================================

describe("Side quests — code block presence", () => {
  test("bluetooth: contains at least one C++ code block for the Arduino sketch", () => {
    const blocks = extractCodeBlocks(read(SIDEQUEST_FILES.bluetooth), "cpp");
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  test("bluetooth: contains at least one JavaScript code block for the browser side", () => {
    const blocks = extractCodeBlocks(read(SIDEQUEST_FILES.bluetooth), "js");
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  test("browser-to-esp32: contains at least one C++ code block", () => {
    const blocks = extractCodeBlocks(read(SIDEQUEST_FILES.browser), "cpp");
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  test("browser-to-esp32: contains at least one JavaScript code block", () => {
    const blocks = extractCodeBlocks(read(SIDEQUEST_FILES.browser), "js");
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  test("wifi-haptic: contains at least one C++ code block", () => {
    const blocks = extractCodeBlocks(read(SIDEQUEST_FILES.wifi), "cpp");
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  test("wifi-haptic: contains at least one JavaScript code block", () => {
    const blocks = extractCodeBlocks(read(SIDEQUEST_FILES.wifi), "js");
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// JavaScript syntax validation
// =============================================================================

describe("Side quests — JavaScript syntax in code blocks", () => {
  // Helper: return null when the code is syntactically valid, or an error
  // message when it is not.  We wrap the snippet in an async function body
  // so that top-level await keywords (common in WebSerial examples) parse
  // correctly without triggering a syntax error.
  function syntaxError(code) {
    try {
      // Wrap in an async IIFE so top-level `await` (common in WebSerial examples)
      // parses correctly.  The closing }) is placed on its own line so that
      // a trailing line comment in the snippet cannot accidentally consume it.
      // eslint-disable-next-line no-new-func
      new Function(`(async () => {\n${code}\n})()`);
      return null;
    } catch (e) {
      return e.message;
    }
  }

  for (const [name, filePath] of Object.entries(SIDEQUEST_FILES)) {
    describe(`${name}`, () => {
      let jsBlocks;
      beforeAll(() => {
        jsBlocks = extractCodeBlocks(read(filePath), "js");
      });

      test("has at least one JavaScript code block", () => {
        expect(jsBlocks.length).toBeGreaterThanOrEqual(1);
      });

      test("all JavaScript code blocks are syntactically valid", () => {
        const errors = jsBlocks
          .map((block, i) => ({ i, err: syntaxError(block) }))
          .filter(({ err }) => err !== null);

        if (errors.length > 0) {
          const msg = errors
            .map(({ i, err }) => `Block ${i + 1}: ${err}`)
            .join("\n");
          throw new Error(`Syntax errors found:\n${msg}`);
        }

        expect(errors.length).toBe(0);
      });
    });
  }
});

// =============================================================================
// Topic-specific content checks
// =============================================================================

describe("Side quests — topic keywords", () => {
  test("bluetooth: references navigator.bluetooth", () => {
    expect(read(SIDEQUEST_FILES.bluetooth)).toMatch(/navigator\.bluetooth/);
  });

  test("bluetooth: references NeoPixel", () => {
    expect(read(SIDEQUEST_FILES.bluetooth)).toMatch(/NeoPixel/i);
  });

  test("browser-to-esp32: references the WebSerial write path", () => {
    const content = read(SIDEQUEST_FILES.browser);
    expect(content).toMatch(/writable/);
  });

  test("browser-to-esp32: references TextEncoder for encoding data to send", () => {
    expect(read(SIDEQUEST_FILES.browser)).toMatch(/TextEncoder/);
  });

  test("wifi-haptic: references WiFi", () => {
    expect(read(SIDEQUEST_FILES.wifi)).toMatch(/WiFi/);
  });

  test("wifi-haptic: references the Claude API or Anthropic", () => {
    expect(read(SIDEQUEST_FILES.wifi)).toMatch(/Claude|Anthropic/i);
  });

  test("wifi-haptic: references the DRV2605L haptic driver", () => {
    expect(read(SIDEQUEST_FILES.wifi)).toMatch(/DRV2605/);
  });
});
