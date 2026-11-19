"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface NavProps { username: string; role: string; }

export default function Nav({ username, role }: NavProps) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const roleLabel: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08]"
      style={{ background: "linear-gradient(135deg, #060b18 0%, #0a1628 50%, #0d1f3c 100%)" }}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">

        {/* CashCall brand */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm"
            style={{ background: "linear-gradient(135deg,#00b896,#00d4a8)", color: "#060b18" }}>CC</div>
          <div className="hidden sm:block">
            <p className="text-white font-bold text-sm tracking-wide leading-none">CashCall</p>
            <p className="text-[#00d4a8] text-[8px] tracking-[0.15em] uppercase leading-none mt-0.5">Restaurant OS</p>
          </div>
        </Link>

        <div className="hidden sm:block h-7 w-px bg-white/10 mx-1" />
        <span className="hidden md:block text-gray-400 text-xs tracking-wide">Financial Command Center</span>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-white text-xs font-semibold">{username}</p>
            <p className="text-[#00d4a8] text-[10px] uppercase tracking-wider">{roleLabel[role] ?? role}</p>
          </div>
          <div className="w-8 h-8 rounded-full border border-[#00d4a8]/50 flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #0d1f3c, #00d4a8)" }}>
            <span className="text-white text-xs font-bold">{username?.[0]?.toUpperCase() ?? "U"}</span>
          </div>
          <Link href="/settings/notifications"
            className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border border-white/15 hover:border-white/40 text-gray-400 hover:text-white transition-colors"
            title="Notifications">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <button onClick={signOut}
            className="text-xs text-gray-300 hover:text-white border border-white/15 hover:border-white/40 rounded-lg px-3 py-1.5 transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
