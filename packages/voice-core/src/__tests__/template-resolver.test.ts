import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../lib/template-resolver.js";

describe("resolveTemplate", () => {
  it("substitutes a known {{variable}}", () => {
    expect(resolveTemplate("Hello {{userName}}!", { userName: "Robin" })).toBe("Hello Robin!");
  });

  it("strips an unresolved placeholder instead of leaving raw {{...}} syntax", () => {
    expect(resolveTemplate("Hello {{unknownVar}}!", {})).toBe("Hello !");
  });

  it("coerces non-string values to string", () => {
    expect(resolveTemplate("Count: {{n}}", { n: 5 })).toBe("Count: 5");
  });

  it("is injection-safe: a variable value containing {{...}} syntax is inserted literally, never re-expanded", () => {
    const result = resolveTemplate("Script: {{script}}", {
      script: "say {{secretVar}}",
      secretVar: "LEAKED",
    });
    expect(result).toBe("Script: say {{secretVar}}");
    expect(result).not.toContain("LEAKED");
  });

  it("only matches \\w+ placeholder names — no regex metacharacter injection", () => {
    expect(resolveTemplate("{{a-b}} stays literal", {})).toBe("{{a-b}} stays literal");
  });
});
