import { describe, expect, it } from "vitest";
import { CallRequestSchema, CallResponseSchema, E164PhoneSchema, UuidV4Schema } from "../calls.js";

describe("E164PhoneSchema", () => {
  it("accepts a valid E.164 number", () => {
    expect(E164PhoneSchema.safeParse("+14155551234").success).toBe(true);
  });

  it("rejects a number missing the leading +", () => {
    expect(E164PhoneSchema.safeParse("14155551234").success).toBe(false);
  });

  it("rejects a number with letters", () => {
    expect(E164PhoneSchema.safeParse("+1415555abcd").success).toBe(false);
  });
});

describe("UuidV4Schema", () => {
  it("accepts a valid UUID v4", () => {
    expect(UuidV4Schema.safeParse("123e4567-e89b-42d3-a456-426614174000").success).toBe(true);
  });

  it("rejects a UUID v1 (wrong version nibble)", () => {
    expect(UuidV4Schema.safeParse("123e4567-e89b-12d3-a456-426614174000").success).toBe(false);
  });
});

describe("CallRequestSchema", () => {
  it("accepts a valid sip call request", () => {
    const result = CallRequestSchema.safeParse({
      agentId: "demo-cascade",
      channel: "sip",
      toNumber: "+14155551234",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid browser call request with no toNumber", () => {
    const result = CallRequestSchema.safeParse({
      agentId: "demo-gemini-realtime",
      channel: "browser",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a sip call request missing toNumber", () => {
    const result = CallRequestSchema.safeParse({
      agentId: "demo-cascade",
      channel: "sip",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty agentId", () => {
    const result = CallRequestSchema.safeParse({
      agentId: "",
      channel: "browser",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid channel", () => {
    const result = CallRequestSchema.safeParse({
      agentId: "demo-cascade",
      channel: "carrier-pigeon",
    });
    expect(result.success).toBe(false);
  });

  it("accepts passthrough dynamicVariables fields not in the base schema", () => {
    const result = CallRequestSchema.safeParse({
      agentId: "demo-cascade",
      channel: "browser",
      dynamicVariables: { userName: "Robin", customField: "anything" },
    });
    expect(result.success).toBe(true);
  });
});

describe("CallResponseSchema", () => {
  it("accepts the QUEUED shape", () => {
    const result = CallResponseSchema.safeParse({
      callSid: "123e4567-e89b-42d3-a456-426614174000",
      status: "QUEUED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects any status other than QUEUED", () => {
    const result = CallResponseSchema.safeParse({
      callSid: "123e4567-e89b-42d3-a456-426614174000",
      status: "COMPLETED",
    });
    expect(result.success).toBe(false);
  });
});
