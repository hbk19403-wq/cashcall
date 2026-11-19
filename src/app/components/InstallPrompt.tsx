"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (localStorage.getItem("pwa-dismissed")) return;

    // iOS Safari
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua)) {
      setIsIOS(true);
      setShow(true);
    }

    // Android / Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setShow(false);
  };

  const dismiss = () => {
    localStorage.setItem("pwa-dismissed", "1");
    setShow(false);
    setDismissed(true);
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
      <div className="rounded-2xl p-4 shadow-2xl"
        style={{ background: "linear-gradient(135deg,#060b18,#0d1f3c)", border: "1px solid rgba(232,184,75,0.4)" }}>
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-72.png" alt="CashCall" className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">Install CashCall</p>
            <p className="text-xs text-amber-200/70 mt-0.5 leading-relaxed">
              {isIOS
                ? 'Tap Share → "Add to Home Screen" to install'
                : "Add to your home screen for the best experience"}
            </p>
          </div>
          <button onClick={dismiss} className="text-white/40 hover:text-white/70 text-xl leading-none flex-shrink-0 mt-0.5">×</button>
        </div>
        {!isIOS && (
          <div className="flex gap-2 mt-3">
            <button onClick={install}
              className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#00d4a8,#00d4a8)" }}>
              📲 Install App
            </button>
            <button onClick={dismiss}
              className="px-4 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white/70">
              Later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
