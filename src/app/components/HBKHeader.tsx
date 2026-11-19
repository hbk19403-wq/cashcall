import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HBKHeader({ username, role }: { username: string; role: string }) {
  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  const roleLabel: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

  return (
    <header className="sticky top-0 z-50 border-b border-[#5a3a1a]/40"
      style={{ background: "linear-gradient(135deg, #1a0d02 0%, #2c1a0e 50%, #1a1f3a 100%)" }}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">

        {/* SSV Group brand (parent) */}
        <div className="flex items-center gap-2 flex-shrink-0 border-r border-white/10 pr-3">
          <Image src="/ssv-logo.svg" alt="SSV" width={32} height={32} className="rounded-full" />
          <div className="hidden lg:block">
            <p className="text-white font-bold text-[10px] tracking-widest leading-none">SSV GROUP</p>
            <p className="text-[#9ca3af] text-[8px] tracking-[0.15em] uppercase leading-none mt-0.5">Success With Impact</p>
          </div>
        </div>

        {/* HBK brand */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <Image src="/logo.svg" alt="HBK" width={38} height={38} className="rounded-full" />
          <div className="hidden sm:block">
            <p className="text-[#e8b84b] font-bold text-sm tracking-widest font-serif leading-none">HBK</p>
            <p className="text-[#c8921a] text-[8px] tracking-[0.2em] uppercase leading-none mt-0.5">Restaurant Group</p>
          </div>
        </Link>

        <div className="hidden sm:block h-7 w-px bg-white/10 mx-1" />
        <span className="hidden md:block text-gray-400 text-xs tracking-wide">Management Portal</span>

        <div className="flex-1" />

        {/* User info */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-white text-xs font-semibold">{username}</p>
            <p className="text-[#e8b84b] text-[10px] uppercase tracking-wider">{roleLabel[role] ?? role}</p>
          </div>
          <div className="w-8 h-8 rounded-full border border-[#e8b84b]/50 flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #3d2010, #c8921a)" }}>
            <span className="text-white text-xs font-bold">{username?.[0]?.toUpperCase() ?? "U"}</span>
          </div>
          <form action={signOut}>
            <button type="submit"
              className="text-xs text-gray-300 hover:text-white border border-white/15 hover:border-white/40 rounded-lg px-3 py-1.5 transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
