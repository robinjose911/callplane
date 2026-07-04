import { describe, expect, it } from "vitest";
import { reduceTranscriptSegment, type TranscriptTurn } from "@/lib/transcript-reducer";

describe("reduceTranscriptSegment", () => {
  it("appends a new turn for a segment with a new id", () => {
    const result = reduceTranscriptSegment([], { id: "seg-1", text: "Hello", final: true }, "agent");
    expect(result).toEqual([{ id: "seg-1", role: "agent", text: "Hello", final: true }]);
  });

  it("preserves arrival order across multiple distinct turns", () => {
    let turns: TranscriptTurn[] = [];
    turns = reduceTranscriptSegment(turns, { id: "seg-1", text: "Hi there", final: true }, "agent");
    turns = reduceTranscriptSegment(turns, { id: "seg-2", text: "I need help", final: true }, "user");

    expect(turns.map((t) => t.id)).toEqual(["seg-1", "seg-2"]);
    expect(turns[1]).toMatchObject({ role: "user", text: "I need help" });
  });

  it("updates the same turn in place when an interim segment reuses its id, instead of appending a duplicate", () => {
    let turns: TranscriptTurn[] = [];
    turns = reduceTranscriptSegment(turns, { id: "seg-1", text: "Hel", final: false }, "agent");
    turns = reduceTranscriptSegment(turns, { id: "seg-1", text: "Hello there", final: true }, "agent");

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ text: "Hello there", final: true });
  });
});
