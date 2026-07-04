"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const EVENT_TYPES = ["post_call_transcription", "call_initiation_failure"] as const;

export function NewWebhookEndpointDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [eventTypes, setEventTypes] = useState<string[]>([...EVENT_TYPES]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleEventType(type: string) {
    setEventTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/webhook-endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, secret, eventTypes }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? "Failed to create webhook endpoint.");
        return;
      }

      setOpen(false);
      setName("");
      setUrl("");
      setSecret("");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-testid="new-webhook-endpoint-button">New endpoint</Button>} />
      <DialogContent data-testid="new-webhook-endpoint-dialog">
        <DialogHeader>
          <DialogTitle>New webhook endpoint</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="webhook-name">Name</Label>
            <Input id="webhook-name" data-testid="webhook-name-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="webhook-url">URL</Label>
            <Input
              id="webhook-url"
              data-testid="webhook-url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="webhook-secret">Secret</Label>
            <Input
              id="webhook-secret"
              data-testid="webhook-secret-input"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Event types</Label>
            {EVENT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`event-type-${type}`}
                  checked={eventTypes.includes(type)}
                  onChange={() => toggleEventType(type)}
                />
                {type}
              </label>
            ))}
          </div>

          {error && (
            <p role="alert" data-testid="new-webhook-endpoint-error" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} data-testid="new-webhook-endpoint-submit">
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
