import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../lib/prompt-builder.js";

describe("buildSystemPrompt", () => {
  it("is a pure function: same params always produce the same output", () => {
    const params = {
      prompt: "You help {{userName}}.",
      languageProfilePrefix: "Speak English.",
      dynamicVariables: { userName: "Robin" },
      enableShortFirstResponse: false,
    };
    expect(buildSystemPrompt(params)).toBe(buildSystemPrompt(params));
  });

  it("prepends the language prefix, then the resolved prompt, joined by blank lines", () => {
    const result = buildSystemPrompt({
      prompt: "You help {{userName}}.",
      languageProfilePrefix: "Speak German. Use the German phonetic alphabet.",
      dynamicVariables: { userName: "Robin" },
      enableShortFirstResponse: false,
    });
    expect(result).toBe("Speak German. Use the German phonetic alphabet.\n\nYou help Robin.");
  });

  it("omits an empty/blank language prefix entirely (no stray leading blank line)", () => {
    const result = buildSystemPrompt({
      prompt: "You help {{userName}}.",
      languageProfilePrefix: "   ",
      dynamicVariables: { userName: "Robin" },
      enableShortFirstResponse: false,
    });
    expect(result).toBe("You help Robin.");
  });

  it("injects the short-first-response instruction between the prefix and the prompt when enabled", () => {
    const result = buildSystemPrompt({
      prompt: "You help {{userName}}.",
      languageProfilePrefix: "Speak English.",
      dynamicVariables: { userName: "Robin" },
      enableShortFirstResponse: true,
    });
    const parts = result.split("\n\n");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("Speak English.");
    expect(parts[1]).toContain("short 1-3 word affirmative filler");
    expect(parts[2]).toBe("You help Robin.");
  });

  it("does not inject the short-first-response instruction when disabled", () => {
    const result = buildSystemPrompt({
      prompt: "You help {{userName}}.",
      languageProfilePrefix: "Speak English.",
      dynamicVariables: { userName: "Robin" },
      enableShortFirstResponse: false,
    });
    expect(result).not.toContain("affirmative filler");
  });
});
