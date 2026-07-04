import { describe, expect, it } from "vitest";
import { StubSipDialer } from "../lib/stub-sip-dialer.js";
import { SipTrunkError } from "../lib/sip-dialer.js";

function params(toNumber: string) {
  return { roomName: "room-1", toNumber, sipTrunkId: "lk-trunk-1", participantIdentity: "caller" };
}

describe("StubSipDialer", () => {
  it("…0000 (or any non-magic suffix) answers", async () => {
    const result = await new StubSipDialer().dialOut(params("+15550000000"));
    expect(result).toMatchObject({ outcome: "answered" });
  });

  it("…0001 is busy", async () => {
    const result = await new StubSipDialer().dialOut(params("+15550000001"));
    expect(result).toEqual({ outcome: "busy" });
  });

  it("…0002 is no_answer", async () => {
    const result = await new StubSipDialer().dialOut(params("+15550000002"));
    expect(result).toEqual({ outcome: "no_answer" });
  });

  it("…0003's first attempt throws a SipTrunkError (trunk-level failure)", async () => {
    await expect(new StubSipDialer().dialOut(params("+15550000003"))).rejects.toBeInstanceOf(SipTrunkError);
  });

  it("…0003's second attempt on the SAME instance answers — simulates trunk-1-fails-trunk-2-succeeds", async () => {
    const dialer = new StubSipDialer();
    await expect(dialer.dialOut(params("+15550000003"))).rejects.toBeInstanceOf(SipTrunkError);

    const result = await dialer.dialOut(params("+15550000003"));
    expect(result).toMatchObject({ outcome: "answered" });
  });

  it("a fresh instance (a new call) fails again on its own first …0003 attempt", async () => {
    await expect(new StubSipDialer().dialOut(params("+15550000003"))).rejects.toBeInstanceOf(SipTrunkError);
  });
});
