"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution, isMarketingPath, track } from "@/lib/attribution";

/** Records how a visitor arrived and counts views of public marketing pages. Renders nothing. */
export default function Attribution() {
  const pathname = usePathname();
  useEffect(() => {
    if (!isMarketingPath(pathname)) return;
    captureAttribution();
    track("page_view");
  }, [pathname]);
  return null;
}
