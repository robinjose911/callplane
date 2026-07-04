import { describe, expect, it, vi } from "vitest";
import type { CallEventRepository } from "@callplane/database";
import { AllProvidersFailedError, resolveProvider } from "../lib/failover-resolver.js";
import type { ProviderChainEntry } from "../lib/provider-registry.js";

function entry(name: string, priority: string): ProviderChainEntry {
  return { id: `id-${name}`, name, priority, credentialsRef: `${name}-secret` };
}

function fakeCallEventRepo(): CallEventRepository {
  return { append: vi.fn().mockResolvedValue({}) } as unknown as CallEventRepository;
}

describe("resolveProvider", () => {
  it("short-circuits on the primary provider when it succeeds — no failover event recorded", async () => {
    const callEventRepo = fakeCallEventRepo();
    const chain = [entry("gemini-live", "primary"), entry("openai-realtime", "secondary")];
    const initFn = vi.fn().mockResolvedValue("gemini-session");

    const result = await resolveProvider(chain, initFn, { callSid: "call-1", callEventRepo });

    expect(result).toBe("gemini-session");
    expect(initFn).toHaveBeenCalledTimes(1);
    expect(initFn).toHaveBeenCalledWith(chain[0]);
    expect(callEventRepo.append).not.toHaveBeenCalled();
  });

  it("falls through to the secondary provider when the primary throws, recording a failover_triggered event", async () => {
    const callEventRepo = fakeCallEventRepo();
    const chain = [entry("gemini-live", "primary"), entry("openai-realtime", "secondary")];
    const initFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("GOOGLE_API_KEY missing"))
      .mockResolvedValueOnce("openai-session");

    const result = await resolveProvider(chain, initFn, { callSid: "call-2", callEventRepo });

    expect(result).toBe("openai-session");
    expect(initFn).toHaveBeenCalledTimes(2);
    expect(callEventRepo.append).toHaveBeenCalledTimes(1);
    expect(callEventRepo.append).toHaveBeenCalledWith({
      callSid: "call-2",
      eventType: "failover_triggered",
      payload: {
        failedProvider: "gemini-live",
        failedProviderId: "id-gemini-live",
        failedProviderPriority: "primary",
        reason: "GOOGLE_API_KEY missing",
      },
    });
  });

  it("respects the chain's given order — does not reorder or retry a provider out of sequence", async () => {
    const callEventRepo = fakeCallEventRepo();
    const chain = [entry("a", "primary"), entry("b", "secondary"), entry("c", "secondary")];
    const attempted: string[] = [];
    const initFn = vi.fn().mockImplementation(async (e: ProviderChainEntry) => {
      attempted.push(e.name);
      if (e.name !== "c") throw new Error(`${e.name} failed`);
      return "c-session";
    });

    await resolveProvider(chain, initFn, { callSid: "call-3", callEventRepo });

    expect(attempted).toEqual(["a", "b", "c"]);
  });

  it("throws a typed AllProvidersFailedError when every provider in the chain fails", async () => {
    const callEventRepo = fakeCallEventRepo();
    const chain = [entry("gemini-live", "primary"), entry("openai-realtime", "secondary")];
    const initFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("no google key"))
      .mockRejectedValueOnce(new Error("no openai key"));

    await expect(resolveProvider(chain, initFn, { callSid: "call-4", callEventRepo })).rejects.toThrow(
      AllProvidersFailedError,
    );
    expect(callEventRepo.append).toHaveBeenCalledTimes(2);
  });

  it("AllProvidersFailedError carries the accumulated per-provider errors", async () => {
    const callEventRepo = fakeCallEventRepo();
    const chain = [entry("gemini-live", "primary")];
    const initFn = vi.fn().mockRejectedValue(new Error("no google key"));

    try {
      await resolveProvider(chain, initFn, { callSid: "call-5", callEventRepo });
      expect.unreachable("resolveProvider should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AllProvidersFailedError);
      const failure = err as AllProvidersFailedError;
      expect(failure.providerType).toBe("gemini-live");
      expect(failure.errors).toHaveLength(1);
      expect(failure.errors[0]?.message).toBe("no google key");
    }
  });

  it("wraps a non-Error throw (e.g. a string) into a real Error before recording it", async () => {
    const callEventRepo = fakeCallEventRepo();
    const chain = [entry("gemini-live", "primary")];
    const initFn = vi.fn().mockRejectedValue("raw string failure");

    await expect(resolveProvider(chain, initFn, { callSid: "call-6", callEventRepo })).rejects.toThrow(
      AllProvidersFailedError,
    );
    expect(callEventRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ reason: "raw string failure" }) }),
    );
  });
});
