import { getSession } from "@/lib/session";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Topbar {...(session.username !== undefined ? { username: session.username } : {})} />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
