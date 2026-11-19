import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/ordering/vendors?locationId=xxx
// Returns vendor contacts for a location
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locationId = req.nextUrl.searchParams.get("locationId");
  if (!locationId) return NextResponse.json({ error: "locationId required" }, { status: 400 });

  // Verify ownership
  const { data: loc } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("user_id", user.id)
    .single();
  if (!loc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("vendor_contacts")
    .select("*")
    .eq("location_id", locationId)
    .order("vendor_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendors: data });
}

// POST /api/ordering/vendors
// Create or upsert a vendor contact
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { location_id, vendor_name, rep_name, rep_email, account_number, notes } = body;

  if (!location_id || !vendor_name || !rep_email) {
    return NextResponse.json({ error: "location_id, vendor_name, rep_email required" }, { status: 400 });
  }

  // Verify ownership
  const { data: loc } = await supabase
    .from("locations")
    .select("id")
    .eq("id", location_id)
    .eq("user_id", user.id)
    .single();
  if (!loc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("vendor_contacts")
    .upsert(
      { location_id, vendor_name, rep_name, rep_email, account_number, notes },
      { onConflict: "location_id,vendor_name" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendor: data });
}

// DELETE /api/ordering/vendors?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("vendor_contacts")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
