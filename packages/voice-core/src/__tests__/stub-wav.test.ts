import { describe, expect, it } from "vitest";
import { generateStubWavBuffer } from "../lib/stub-wav.js";

describe("generateStubWavBuffer", () => {
  it("produces a valid RIFF/WAVE header", () => {
    const buffer = generateStubWavBuffer(1);
    expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buffer.toString("ascii", 12, 16)).toBe("fmt ");
    expect(buffer.toString("ascii", 36, 40)).toBe("data");
  });

  it("scales file size with duration", () => {
    const oneSecond = generateStubWavBuffer(1);
    const twoSeconds = generateStubWavBuffer(2);
    expect(twoSeconds.length).toBeGreaterThan(oneSecond.length);
  });

  it("clamps to at least one sample for a zero or negative duration", () => {
    const buffer = generateStubWavBuffer(0);
    expect(buffer.length).toBeGreaterThan(44); // header + at least 1 sample
  });
});
