"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function Topbar({ username }: { username?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <SidebarTrigger data-testid="sidebar-trigger" />
      <div className="flex items-center gap-3">
        {username && (
          <span data-testid="topbar-username" className="text-muted-foreground text-sm">
            {username}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="logout-button">
          Log out
        </Button>
      </div>
    </header>
  );
}
