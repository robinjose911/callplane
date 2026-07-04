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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const STUB_SCENARIOS = ["demo_greeting", "demo_booking", "demo_failure"] as const;

interface AgentConfigResponse {
  name: string;
  voiceMode: string;
}

interface VariableRow {
  key: string;
  value: string;
}

export function NewCallDialog({ agents, stubMode }: { agents: AgentConfigResponse[]; stubMode: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(agents[0]?.name ?? "");
  const [toNumber, setToNumber] = useState("");
  const [scenario, setScenario] = useState<string>(STUB_SCENARIOS[0]);
  const [variables, setVariables] = useState<VariableRow[]>([{ key: "", value: "" }]);
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateVariable(index: number, field: "key" | "value", value: string) {
    setVariables((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addVariableRow() {
    setVariables((prev) => [...prev, { key: "", value: "" }]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    if (!E164_REGEX.test(toNumber)) {
      setPhoneError("Enter a valid E.164 number, e.g. +14155551234");
      return;
    }
    setPhoneError(undefined);
    setIsSubmitting(true);

    const dynamicVariables = Object.fromEntries(
      variables.filter((row) => row.key.trim().length > 0).map((row) => [row.key.trim(), row.value]),
    );

    try {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          channel: "sip",
          toNumber,
          ...(stubMode ? { scenario } : {}),
          ...(Object.keys(dynamicVariables).length > 0 ? { dynamicVariables } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setSubmitError(body.error?.message ?? "Failed to start call.");
        return;
      }

      setOpen(false);
      router.push(`/calls/${body.callSid}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-testid="new-call-button">New call</Button>} />
      <DialogContent data-testid="new-call-dialog">
        <DialogHeader>
          <DialogTitle>New call</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-call-agent">Agent</Label>
            <Select value={agentId} onValueChange={(value) => setAgentId(value ?? "")}>
              <SelectTrigger id="new-call-agent" data-testid="new-call-agent-select">
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.name} value={agent.name}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-call-number">Phone number</Label>
            <Input
              id="new-call-number"
              data-testid="new-call-number"
              value={toNumber}
              onChange={(e) => setToNumber(e.target.value)}
              placeholder="+14155551234"
              aria-invalid={phoneError ? "true" : undefined}
            />
            {phoneError && (
              <p role="alert" data-testid="new-call-number-error" className="text-destructive text-sm">
                {phoneError}
              </p>
            )}
          </div>

          {stubMode && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-call-scenario">Stub scenario</Label>
              <Select value={scenario} onValueChange={(value) => setScenario(value ?? STUB_SCENARIOS[0])}>
                <SelectTrigger id="new-call-scenario" data-testid="new-call-scenario-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STUB_SCENARIOS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>Dynamic variables</Label>
            {variables.map((row, index) => (
              <div key={index} className="flex gap-2" data-testid={`variable-row-${index}`}>
                <Input
                  data-testid={`variable-key-${index}`}
                  value={row.key}
                  onChange={(e) => updateVariable(index, "key", e.target.value)}
                  placeholder="key"
                />
                <Input
                  data-testid={`variable-value-${index}`}
                  value={row.value}
                  onChange={(e) => updateVariable(index, "value", e.target.value)}
                  placeholder="value"
                />
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addVariableRow} data-testid="add-variable-row">
              Add variable
            </Button>
          </div>

          {submitError && (
            <p role="alert" data-testid="new-call-error" className="text-destructive text-sm">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} data-testid="new-call-submit">
              {isSubmitting ? "Starting..." : "Start call"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
