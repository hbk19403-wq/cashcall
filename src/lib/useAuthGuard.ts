"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type UserRole = "owner" | "manager" | "staff";

interface AuthState {
  ready: boolean;
  role: UserRole | null;
  locationId: string | null;
  fullAccess: boolean;
}

/**
 * Verifies the user session on mount and redirects to /login if none exists.
 * Also fetches role, location_id, and full_access from user_profiles.
 *
 * fullAccess = true means a manager has been granted unrestricted access to their location
 * (same as owner-level visibility, but scoped to their single location).
 */
export function useAuthGuard(): AuthState {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    ready: false, role: null, locationId: null, fullAccess: false,
  });

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/login"); return; }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role,location_id,full_access")
        .eq("user_id", user.id)
        .single();

      setState({
        ready: true,
        role: (profile?.role ?? null) as UserRole | null,
        locationId: profile?.location_id ?? null,
        fullAccess: profile?.full_access ?? false,
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setState({ ready: false, role: null, locationId: null, fullAccess: false });
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return state;
}
