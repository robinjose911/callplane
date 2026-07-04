import { createHmac } from "node:crypto";
import express, { type Express } from "express";
import type { Server } from "node:http";

export interface ReceivedWebhook {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  signatureValid: boolean;
}

/**
 * A tiny stand-in "customer" webhook consumer for e2e tests — records every delivery it
 * receives and verifies the `ElevenLabs-Signature` header against the shared secret, matching
 * exactly how a real ElevenLabs-compatible verifier would (CLAUDE.md's stated compatibility
 * contract). This same verification logic is what `examples/webhook-receiver/` demonstrates for
 * the public — see that directory for the standalone version.
 */
export class TestWebhookReceiver {
  readonly received: ReceivedWebhook[] = [];
  private app: Express;
  private server: Server | undefined;

  constructor(private readonly secret: string) {
    this.app = express();
    this.app.use(express.text({ type: "*/*" }));
    this.app.post("/webhook", (req, res) => {
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const signatureHeader = req.header("ElevenLabs-Signature") ?? "";
      this.received.push({
        headers: req.headers,
        body: JSON.parse(rawBody),
        signatureValid: this.verifySignature(signatureHeader, rawBody),
      });
      res.status(200).json({ received: true });
    });
  }

  private verifySignature(header: string, rawBody: string): boolean {
    const match = /^t=(\d+),v0=([0-9a-f]+)$/.exec(header);
    if (!match) return false;
    const [, timestamp, hex] = match;
    const expected = createHmac("sha256", this.secret).update(`${timestamp}.${rawBody}`).digest("hex");
    return expected === hex;
  }

  async start(port: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server = this.app.listen(port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server?.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
