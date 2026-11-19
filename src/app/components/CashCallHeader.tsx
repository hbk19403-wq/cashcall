import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function CashCallHeader({ username, role }: { username: string; role: string }) {
  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  const roleLabel: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

  return (
    <header className="sticky top-0 z-50 border-b"
      style={{ background: "rgba(6,11,24,0.96)", borderColor: "rgba(0,212,168,0.15)", backdropFilter: "blur(12px)" }}>
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">

        {/* CashCall brand */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(0,212,168,0.15)", border: "1px solid rgba(0,212,168,0.4)" }}>
            <span className="text-sm font-bold" style={{ color: "#00d4a8" }}>⚡</span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold leading-none" style={{ color: "#00d4a8", fontFamily: "var(--font-space)" }}>CashCall</p>
            <p className="text-[9px] tracking-[0.2em] uppercase leading-none mt-0.5" style={{ color: "#374151" }}>Financial OS</p>
          </div>
        </Link>

        <div className="hidden sm:block h-6 w-px mx-1" style={{ background: "rgba(255,255,255,0.08)" }} />

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1 text-xs">
          {[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/dashboard/rollup", label: "Roll-Up" },
            { href: "/dashboard/gpo",    label: "GPO" },
            { href: "/settings/integrations", label: "⚙ Integrations" },
            { href: "/analytics", label: "Analytics" },
            { href: "/budget", label: "Budget" },
            { href: "/dashboard/ordering", label: "Ordering" },
          ].map(n => (
            <Link key={n.href} href={n.href}
              className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Vault status */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", color: "#818cf8" }}>
          <span>🔐</span>
          <span className="font-medium">Vault Active</span>
        </div>

        {/* User info */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-white">{username ? username.charAt(0).toUpperCase() + username.slice(1) : ""}</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "#00d4a8" }}>{roleLabel[role] ?? role}</p>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(0,212,168,0.2)", border: "1px solid rgba(0,212,168,0.4)" }}>
            <span className="text-xs font-bold" style={{ color: "#00d4a8" }}>{username?.[0]?.toUpperCase() ?? "U"}</span>
          </div>
          <form action={signOut}>
            <button type="submit"
              className="text-xs text-gray-400 hover:text-white border rounded-lg px-3 py-1.5 transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
