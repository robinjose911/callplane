const SAMPLE_RATE = 8000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

/**
 * Generates a valid, deterministic silent WAV file — `RECORDING_MODE=stub`'s recorded artifact.
 * Real audio isn't needed (there's no real audio in stub mode to begin with — see
 * StubVoiceSession); a correctly-structured WAV header is what makes the pipeline e2e-real
 * (playable through a real `<audio>` element / the API's streaming route) without LiveKit Cloud
 * Egress, which doesn't run against the local dev server.
 */
export function generateStubWavBuffer(durationSeconds: number): Buffer {
  const numSamples = Math.max(1, Math.round(SAMPLE_RATE * durationSeconds));
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  buffer.writeUInt16LE(1, 20); // audio format: PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * blockAlign, 28); // byte rate
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  // Sample data left as zero-filled silence — Buffer.alloc already zero-initializes.

  return buffer;
}
