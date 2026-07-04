import { type PrismaClient, type WebhookEndpoint, type WebhookEventType } from "@prisma/client";

export interface CreateWebhookEndpointInput {
  name: string;
  url: string;
  secret: string;
  isEnabled?: boolean;
  eventTypes: WebhookEventType[];
}

export interface UpdateWebhookEndpointInput {
  url?: string;
  secret?: string;
  isEnabled?: boolean;
  eventTypes?: WebhookEventType[];
}

/** `redact()` matches the public-repo hygiene invariant: credential fields never leave this file unmasked. */
function redact(endpoint: WebhookEndpoint): WebhookEndpoint {
  return { ...endpoint, secret: "****" };
}

export function createWebhookEndpointRepository(prisma: PrismaClient) {
  return {
    async listAll(): Promise<WebhookEndpoint[]> {
      const endpoints = await prisma.webhookEndpoint.findMany({ orderBy: { name: "asc" } });
      return endpoints.map(redact);
    },

    async findByName(name: string): Promise<WebhookEndpoint | null> {
      const endpoint = await prisma.webhookEndpoint.findUnique({ where: { name } });
      return endpoint ? redact(endpoint) : null;
    },

    /** Internal-only: returns the real secret for HMAC signing. Never expose via an API response. */
    async findByIdWithSecret(id: string): Promise<WebhookEndpoint | null> {
      return prisma.webhookEndpoint.findUnique({ where: { id } });
    },

    async create(input: CreateWebhookEndpointInput): Promise<WebhookEndpoint> {
      const endpoint = await prisma.webhookEndpoint.create({ data: input });
      return redact(endpoint);
    },

    async upsertByName(name: string, input: CreateWebhookEndpointInput): Promise<WebhookEndpoint> {
      const endpoint = await prisma.webhookEndpoint.upsert({
        where: { name },
        create: input,
        update: input,
      });
      return redact(endpoint);
    },

    async update(name: string, input: UpdateWebhookEndpointInput): Promise<WebhookEndpoint> {
      const endpoint = await prisma.webhookEndpoint.update({ where: { name }, data: input });
      return redact(endpoint);
    },
  };
}

export type WebhookEndpointRepository = ReturnType<typeof createWebhookEndpointRepository>;
