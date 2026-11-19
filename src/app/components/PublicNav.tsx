"use client";

import { useState } from "react";
import Link from "next/link";

const BRAND = "#00d4a8";

const NAV_LINKS = [
  { href: "/about",     label: "About"     },
  { href: "/press",     label: "Press"     },
  { href: "/investors", label: "Investors" },
  { href: "/manual",    label: "Manual"    },
  { href: "/sandbox",   label: "Demo"      },
];

export default function PublicNav({ active }: { active?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gray-950/90 backdrop-blur-sm">
        {/* Logo */}
        <Link href="/" className="font-bold text-lg flex-shrink-0" style={{ color: BRAND }}>
          ⚡ CashCall
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-4">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href}
              className={`text-sm transition-colors ${active === l.href ? "font-semibold text-white" : "text-gray-400 hover:text-white"}`}>
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="text-sm text-gray-400 hover:text-white">Sign In</Link>
          <Link href="/trial"
            className="px-4 py-1.5 rounded-lg text-sm font-bold text-gray-900 hover:opacity-90"
            style={{ background: BRAND }}>
            Get Started
          </Link>
        </div>

        {/* Mobile right side */}
        <div className="flex md:hidden items-center gap-3">
          <Link href="/trial"
            className="px-3 py-1.5 rounded-lg text-sm font-bold text-gray-900"
            style={{ background: BRAND }}>
            Get Started
          </Link>
          <button
            onClick={() => setOpen(o => !o)}
            className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            aria-label="Menu">
            <span className={`block w-5 h-0.5 bg-white transition-all origin-center ${open ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block w-5 h-0.5 bg-white transition-all ${open ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-white transition-all origin-center ${open ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute top-[72px] right-0 left-0 border-b border-white/10 py-4 px-5 space-y-1"
            style={{ background: "#0a1025" }}
            onClick={e => e.stopPropagation()}>
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href}
                onClick={() => setOpen(false)}
                className={`flex items-center py-3 px-3 rounded-xl text-sm font-medium transition-colors ${
                  active === l.href
                    ? "text-white font-semibold"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                style={active === l.href ? { background: `${BRAND}15`, color: BRAND } : {}}>
                {l.label}
              </Link>
            ))}
            <div className="h-px bg-white/10 my-2" />
            <Link href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center py-3 px-3 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5">
              Sign In
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
