"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// On a hard reload (F5 / refresh) of any inner page, return to the homepage.
// In-app link navigation and freshly-opened/shared links are unaffected — only a
// reload triggers it (detected via the Navigation Timing API).
export function ReloadToHome() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav?.type === "reload" && pathname !== "/") {
        router.replace("/");
      }
    } catch {
      /* Navigation Timing unsupported — no-op */
    }
    // run once on initial mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
