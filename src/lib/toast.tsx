"use client";

import { createContext, useCallback, useContext, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, durationMs?: number) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

// ── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(
    (message: string, type: ToastType = "success", durationMs = 4000) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    },
    []
  );

  const remove = (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  const styleMap: Record<ToastType, string> = {
    success: "bg-emerald-900/90 border-emerald-500/40 text-emerald-100",
    error:   "bg-red-900/90 border-red-500/40 text-red-100",
    warning: "bg-amber-900/90 border-amber-500/40 text-amber-100",
    info:    "bg-[#0f172a]/90 border-white/10 text-gray-200",
  };

  const iconMap: Record<ToastType, string> = {
    success: "✓",
    error:   "✗",
    warning: "⚠",
    info:    "ℹ",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — bottom-right on desktop, bottom-center on mobile */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 sm:right-6 z-[9999] flex flex-col gap-2 w-[calc(100vw-2rem)] sm:w-auto sm:max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-2xl border backdrop-blur-md shadow-xl pointer-events-auto text-sm font-medium transition-all animate-fade-in-up ${styleMap[t.type]}`}
          >
            <span className="text-base leading-none mt-0.5 shrink-0">{iconMap[t.type]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-xs mt-0.5"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useToast() {
  return useContext(ToastContext).toast;
}
