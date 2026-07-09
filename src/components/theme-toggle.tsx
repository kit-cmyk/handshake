"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

/**
 * Icon button that flips between light and dark. Renders a neutral placeholder
 * until mounted so the server markup (which can't know the resolved theme)
 * doesn't mismatch the client icon.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Until mounted, the resolved theme is unknown to the server, so keep the
  // label/icon in a fixed default that matches the server render — the effect
  // above flips it on the client and avoids a hydration mismatch.
  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-[1.15rem]" strokeWidth={2} />
        ) : (
          <Moon className="size-[1.15rem]" strokeWidth={2} />
        )
      ) : (
        <span className="size-[1.15rem]" />
      )}
    </button>
  );
}
