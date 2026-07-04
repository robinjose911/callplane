import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">callplane</h1>
      <p className="text-muted-foreground max-w-md">
        A self-hostable AI voice agent control plane. The console is under construction — check
        back soon.
      </p>
      <a
        href="https://github.com/robinjose911/callplane"
        className={cn(buttonVariants({ variant: "secondary" }))}
      >
        View on GitHub
      </a>
    </div>
  );
}
