"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  History,
  Bot,
  Router as RouterIcon,
  Webhook,
  DollarSign,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { href: "/playground", label: "Playground", icon: PhoneCall, testId: "nav-playground" },
  { href: "/calls", label: "Calls", icon: History, testId: "nav-calls" },
  { href: "/agents", label: "Agents", icon: Bot, testId: "nav-agents" },
  { href: "/trunks", label: "Trunks", icon: RouterIcon, testId: "nav-trunks" },
  { href: "/webhooks", label: "Webhooks", icon: Webhook, testId: "nav-webhooks" },
  { href: "/costs", label: "Costs", icon: DollarSign, testId: "nav-costs" },
  { href: "/settings", label: "Settings", icon: Settings, testId: "nav-settings" },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar data-testid="app-sidebar">
      <SidebarHeader>
        <span className="px-2 py-1 text-sm font-semibold tracking-tight">callplane</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Console</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} data-testid={item.testId} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
