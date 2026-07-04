import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { signWebhookPayload } from "../lib/webhook-signer.js";

describe("signWebhookPayload", () => {
  it("matches a known ts+body+secret -> exact hex vector (the compatibility contract)", () => {
    const secret = "whsec_test_secret";
    const body = '{"type":"post_call_transcription"}';
    const ts = 1700000000;

    const expectedHex = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    const signature = signWebhookPayload(secret, body, ts);

    expect(signature).toBe(`t=${ts},v0=${expectedHex}`);
  });

  it("produces a different signature for a different secret, same body+ts", () => {
    const sigA = signWebhookPayload("secret-a", "{}", 1700000000);
    const sigB = signWebhookPayload("secret-b", "{}", 1700000000);
    expect(sigA).not.toBe(sigB);
  });

  it("produces a different signature for a different body, same secret+ts", () => {
    const sigA = signWebhookPayload("secret", '{"a":1}', 1700000000);
    const sigB = signWebhookPayload("secret", '{"a":2}', 1700000000);
    expect(sigA).not.toBe(sigB);
  });
});
