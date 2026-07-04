"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";

export function WebhookEndpointEnabledToggle({ name, isEnabled }: { name: string; isEnabled: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(isEnabled);
  const [isSaving, setIsSaving] = useState(false);

  async function handleChange(next: boolean) {
    setChecked(next);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/webhook-endpoints/${name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: next }),
      });
      if (!response.ok) {
        setChecked(!next); // revert on failure
        return;
      }
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Switch
      data-testid={`webhook-endpoint-enabled-${name}`}
      checked={checked}
      disabled={isSaving}
      onCheckedChange={handleChange}
    />
  );
}
