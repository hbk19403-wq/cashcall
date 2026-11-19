import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CashCallHeader from "@/app/components/CashCallHeader";
import GpoClient from "./GpoClient";

export default async function GpoDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role,username")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "owner") redirect("/login");

  return (
    <div style={{ minHeight: "100vh", background: "#060b18", color: "rgba(255,255,255,0.85)" }}>
      <CashCallHeader username={profile.username} role={profile.role} />
      <GpoClient />
    </div>
  );
}
