"use client";

import { Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface MonthPickerProps {
  current: string; // "YYYY-MM-01"
}

function MonthPickerInner({ current }: MonthPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Build prev / next month strings
  const d = new Date(current + "T00:00:00");
  const prev = new Date(d);
  prev.setMonth(prev.getMonth() - 1);
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);

  function toMonthStr(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  }

  function navigate(month: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    router.push(`${pathname}?${params.toString()}`);
  }

  const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => navigate(toMonthStr(prev))}
        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="text-sm font-medium text-gray-700 min-w-[130px] text-center">
        {label}
      </span>
      <button
        onClick={() => navigate(toMonthStr(next))}
        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}

export default function MonthPicker({ current }: MonthPickerProps) {
  return (
    <Suspense fallback={
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-lg border border-gray-200 text-gray-600" aria-label="Previous month">‹</button>
        <span className="text-sm font-medium text-gray-700 min-w-[130px] text-center">Loading…</span>
        <button className="p-2 rounded-lg border border-gray-200 text-gray-600" aria-label="Next month">›</button>
      </div>
    }>
      <MonthPickerInner current={current} />
    </Suspense>
  );
}
