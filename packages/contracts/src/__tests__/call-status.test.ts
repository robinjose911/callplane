import { describe, expect, it } from "vitest";
import {
  CALL_STATUS_TRANSITIONS,
  CallStatusSchema,
  TERMINAL_CALL_STATUSES,
  isValidStatusTransition,
} from "../call-status.js";

describe("CallStatusSchema", () => {
  it("accepts every documented lifecycle status", () => {
    for (const status of [
      "QUEUED",
      "DIALING",
      "RINGING",
      "IN_PROGRESS",
      "COMPLETED",
      "FAILED",
      "NO_ANSWER",
      "BUSY",
      "CALL_DROPPED",
    ]) {
      expect(CallStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(CallStatusSchema.safeParse("RANDOM").success).toBe(false);
  });
});

describe("isValidStatusTransition", () => {
  it("allows the happy-path lifecycle", () => {
    expect(isValidStatusTransition("QUEUED", "DIALING")).toBe(true);
    expect(isValidStatusTransition("DIALING", "RINGING")).toBe(true);
    expect(isValidStatusTransition("RINGING", "IN_PROGRESS")).toBe(true);
    expect(isValidStatusTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });

  it("rejects a terminal status transitioning anywhere, e.g. COMPLETED -> RINGING", () => {
    expect(isValidStatusTransition("COMPLETED", "RINGING")).toBe(false);
  });

  it("rejects skipping a lifecycle stage, e.g. QUEUED -> IN_PROGRESS", () => {
    expect(isValidStatusTransition("QUEUED", "IN_PROGRESS")).toBe(false);
  });

  it("allows CALL_DROPPED only from IN_PROGRESS", () => {
    expect(isValidStatusTransition("IN_PROGRESS", "CALL_DROPPED")).toBe(true);
    expect(isValidStatusTransition("RINGING", "CALL_DROPPED")).toBe(false);
  });

  it("every terminal status has no outgoing transitions", () => {
    for (const status of TERMINAL_CALL_STATUSES) {
      expect(CALL_STATUS_TRANSITIONS[status]).toEqual([]);
    }
  });
});
