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

const PROVIDERS = ["telnyx", "twilio", "generic"] as const;

export function NewTrunkDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<string>(PROVIDERS[0]);
  const [livekitTrunkId, setLivekitTrunkId] = useState("");
  const [credentialsRef, setCredentialsRef] = useState("");
  const [weight, setWeight] = useState("100");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/trunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, provider, livekitTrunkId, credentialsRef, weight: Number(weight) }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? "Failed to create trunk.");
        return;
      }

      setOpen(false);
      setName("");
      setLivekitTrunkId("");
      setCredentialsRef("");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-testid="new-trunk-button">New trunk</Button>} />
      <DialogContent data-testid="new-trunk-dialog">
        <DialogHeader>
          <DialogTitle>New SIP trunk</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="trunk-name">Name</Label>
            <Input id="trunk-name" data-testid="trunk-name-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="trunk-provider">Provider</Label>
            <select
              id="trunk-provider"
              data-testid="trunk-provider-select"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="trunk-livekit-id">LiveKit trunk ID</Label>
            <Input
              id="trunk-livekit-id"
              data-testid="trunk-livekit-id-input"
              value={livekitTrunkId}
              onChange={(e) => setLivekitTrunkId(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="trunk-credentials-ref">Credentials reference</Label>
            <Input
              id="trunk-credentials-ref"
              data-testid="trunk-credentials-ref-input"
              value={credentialsRef}
              onChange={(e) => setCredentialsRef(e.target.value)}
              placeholder="e.g. an env var name or secret manager ID — never the raw credential"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="trunk-weight">Failover weight</Label>
            <Input
              id="trunk-weight"
              data-testid="trunk-weight-input"
              type="number"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" data-testid="new-trunk-error" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} data-testid="new-trunk-submit">
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
