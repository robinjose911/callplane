"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";

export function TrunkActiveToggle({ name, isActive }: { name: string; isActive: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(isActive);
  const [isSaving, setIsSaving] = useState(false);

  async function handleChange(next: boolean) {
    setChecked(next);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/trunks/${name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
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
    <Switch data-testid={`trunk-active-${name}`} checked={checked} disabled={isSaving} onCheckedChange={handleChange} />
  );
}
