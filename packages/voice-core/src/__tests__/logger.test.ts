import { describe, expect, it, vi } from "vitest";
import { createChildLogger, logger } from "../lib/logger.js";

describe("logger", () => {
  it("binds permanent context fields on child loggers", () => {
    const spy = vi.spyOn(logger, "child");
    const child = createChildLogger({ worker: "callExecutor", callSid: "abc-123" });

    expect(spy).toHaveBeenCalledWith({ worker: "callExecutor", callSid: "abc-123" });
    expect(child.bindings()).toMatchObject({ worker: "callExecutor", callSid: "abc-123" });

    spy.mockRestore();
  });

  it("nests context across multiple child levels", () => {
    const first = createChildLogger({ worker: "callExecutor" });
    const second = first.child({ callSid: "abc-123" });

    expect(second.bindings()).toMatchObject({ worker: "callExecutor", callSid: "abc-123" });
  });

  it("carries the service base field from pino options", () => {
    expect(logger.bindings()).not.toHaveProperty("worker");
  });
});
