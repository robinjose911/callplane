export interface TranscriptSegmentInput {
  id: string;
  text: string;
  final: boolean;
}

export interface TranscriptTurn {
  id: string;
  role: "agent" | "user";
  text: string;
  final: boolean;
}

/**
 * Folds one incoming transcription segment into the ordered turn list. An interim segment
 * (`final: false`) updates its turn in place as more text streams in; a segment reusing an
 * already-seen `id` replaces that turn's text/finality rather than appending a duplicate — the
 * same `id` means the same logical turn across interim -> final updates. A new `id` appends a
 * new turn at the end, preserving arrival order.
 */
export function reduceTranscriptSegment(
  turns: TranscriptTurn[],
  segment: TranscriptSegmentInput,
  role: "agent" | "user",
): TranscriptTurn[] {
  const turn: TranscriptTurn = { id: segment.id, role, text: segment.text, final: segment.final };
  const existingIndex = turns.findIndex((t) => t.id === segment.id);

  if (existingIndex === -1) {
    return [...turns, turn];
  }

  const next = [...turns];
  next[existingIndex] = turn;
  return next;
}
