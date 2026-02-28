"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Silently refreshes server component data:
 *  - whenever the browser tab regains focus
 *  - every INTERVAL_MS while the tab is active
 *
 * This keeps the dashboard / bets / wallet in sync with
 * background jobs like auto-settle without a full page reload.
 */
const INTERVAL_MS = 60_000; // 60 seconds

export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    // Refresh on tab focus (user switching back to the tab)
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);

    // Periodic refresh while the tab is active
    const timer = setInterval(() => router.refresh(), INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [router]);

  return null;
}
