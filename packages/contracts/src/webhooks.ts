import { z } from "zod";
import { UuidV4Schema } from "./calls.js";
import { FailureReasonSchema } from "./call-status.js";

/**
 * Webhook payload field names are intentionally snake_case, not the repo's usual camelCase
 * (see CLAUDE.md D3): these payloads are drop-in compatible with existing ElevenLabs webhook
 * consumers, both in shape and in the `ElevenLabs-Signature` HMAC header. This is a documented
 * compatibility feature, not an inconsistency.
 */

const UnixTimestampSchema = z.number().int().positive("event_timestamp must be a positive integer");

/** A single transcript turn in the `post_call_transcription` webhook. */
export const TranscriptTurnSchema = z.object({
  role: z.enum(["agent", "user"]),
  message: z.string(),
  time_in_call_secs: z.number().int().min(0),
});

export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;

/** Call analysis block included in `post_call_transcription`. */
export const CallAnalysisSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative", "unknown"]).default("unknown"),
  summary: z.string().optional(),
  goal_achieved: z.boolean().nullable().optional(),
});

export type CallAnalysis = z.infer<typeof CallAnalysisSchema>;

/**
 * Webhook event: `call_initiation_failure` — the call could not be established (busy, no
 * answer, provider error, trunk unavailable, etc). Exactly one event of this type per call.
 */
export const CallInitiationFailurePayloadSchema = z.object({
  type: z.literal("call_initiation_failure"),
  event_timestamp: UnixTimestampSchema,
  data: z.object({
    call_sid: UuidV4Schema,
    failure_reason: FailureReasonSchema,
  }),
});

export type CallInitiationFailurePayload = z.infer<typeof CallInitiationFailurePayloadSchema>;

/**
 * Webhook event: `post_call_transcription` — the call completed successfully. Includes the
 * full transcript, analysis, and metadata. Exactly one event of this type per call.
 */
export const PostCallTranscriptionPayloadSchema = z.object({
  type: z.literal("post_call_transcription"),
  event_timestamp: UnixTimestampSchema,
  data: z.object({
    call_sid: UuidV4Schema,
    status: z.literal("completed"),
    transcript: z.array(TranscriptTurnSchema),
    analysis: CallAnalysisSchema.optional(),
  }),
});

export type PostCallTranscriptionPayload = z.infer<typeof PostCallTranscriptionPayloadSchema>;

/** Union of all webhook event payload types. */
export const WebhookPayloadSchema = z.discriminatedUnion("type", [
  CallInitiationFailurePayloadSchema,
  PostCallTranscriptionPayloadSchema,
]);

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

/** The two webhook event type literals. */
export const WEBHOOK_EVENT_TYPES = ["call_initiation_failure", "post_call_transcription"] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Idempotency key format for webhook outbox entries — exactly-once delivery tracking. */
export function buildWebhookIdempotencyKey(callSid: string, eventType: WebhookEventType): string {
  return `${callSid}:${eventType}`;
}
