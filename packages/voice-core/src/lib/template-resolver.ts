import { createChildLogger } from "./logger.js";

const logger = createChildLogger({ module: "template-resolver" });

/**
 * Resolves `{{variable_name}}` placeholders in a template string against `dynamicVariables`.
 *
 * Single-pass by design (injection-safety): if a variable's own *value* happens to contain
 * `{{...}}`-looking text, it is inserted literally and never re-scanned for further expansion —
 * unlike the source project's nested-resolution behavior, this repo's genericized version never lets a caller's
 * data become template syntax. Unresolved placeholders are stripped (never leaked to the
 * model/voice as raw `{{...}}` text) and logged for the prompt author to catch typos.
 *
 * Only `\w+` keys are matched — no regex/property injection risk from the placeholder name itself.
 */
export function resolveTemplate(template: string, dynamicVariables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(dynamicVariables, key)) {
      logger.warn({ key }, "Unresolved template placeholder");
      return "";
    }
    const value = dynamicVariables[key];
    return typeof value === "string" ? value : String(value ?? "");
  });
}
