import { z } from "zod";

/** UUID v4 regex — used for callSid validation. */
const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const UuidV4Schema = z.string().regex(uuidV4Regex, "Must be a valid UUID v4");

export type UuidV4 = z.infer<typeof UuidV4Schema>;

/** E.164 phone number format: + followed by 7–15 digits. */
const e164Regex = /^\+[1-9]\d{6,14}$/;

export const E164PhoneSchema = z
  .string()
  .regex(e164Regex, "Must be a valid E.164 phone number (e.g. +14155551234)");

export type E164Phone = z.infer<typeof E164PhoneSchema>;

/** How the call is connected: outbound SIP telephony, or an in-browser LiveKit room. */
export const ChannelSchema = z.enum(["sip", "browser"]);

export type Channel = z.infer<typeof ChannelSchema>;

/**
 * Dynamic variables interpolated into the agent's system prompt. All fields optional at the
 * schema level — `.passthrough()` allows future variables without a schema-breaking change.
 */
export const DynamicVariablesSchema = z
  .object({
    userName: z.string().optional(),
    userPhone: E164PhoneSchema.optional(),
    goal: z.string().optional(),
  })
  .passthrough();

export type DynamicVariables = z.infer<typeof DynamicVariablesSchema>;

/**
 * Inbound request body for `POST /v1/calls`.
 *
 * `toNumber` is required for `channel: "sip"`, forbidden for `channel: "browser"` (the browser
 * joins a LiveKit room directly — see Stage 6). `scenario` selects a stub conversation fixture
 * and is only accepted when `PROVIDER_STUB_MODE`/`SIP_STUB_MODE` are enabled.
 *
 * Idempotency rule: a repeated request with the same `toNumber` + `agentId` within
 * `IDEMPOTENCY_WINDOW_SECONDS` returns the existing `callSid` (no duplicate call created).
 */
export const CallRequestSchema = z
  .object({
    agentId: z.string().min(1, "agentId is required"),
    channel: ChannelSchema,
    toNumber: E164PhoneSchema.optional(),
    scenario: z.string().min(1).optional(),
    dynamicVariables: DynamicVariablesSchema.optional(),
  })
  .refine((body) => body.channel !== "sip" || body.toNumber !== undefined, {
    message: "toNumber is required when channel is \"sip\"",
    path: ["toNumber"],
  });

export type CallRequest = z.infer<typeof CallRequestSchema>;

/** Success response body for `POST /v1/calls`. Returned immediately (API-time, pre-dial). */
export const CallResponseSchema = z.object({
  callSid: UuidV4Schema,
  status: z.literal("QUEUED"),
});

export type CallResponse = z.infer<typeof CallResponseSchema>;

/** Idempotency window in seconds for repeated `POST /v1/calls` with the same agent+number. */
export const IDEMPOTENCY_WINDOW_SECONDS = 60 as const;
