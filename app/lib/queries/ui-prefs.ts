import { createClient, createServiceClient } from "@/lib/supabase/server";

export type ViewPrefs = {
  visibility?: Record<string, boolean>;
  order?: string[];
  sortCol?: string;
  sortDir?: "asc" | "desc";
};

export type AllUiPrefs = Record<string, ViewPrefs>;

export async function fetchCurrentRol(): Promise<string | null> {
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user?.email) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = await createServiceClient() as any;
    const { data } = await sb.from("usuarios_sistema").select("rol").eq("email", user.email).single();
    return data?.rol ?? null;
  } catch {
    return null;
  }
}

import type { Enums } from "@/types/supabase";

export async function fetchCurrentUserRolFase(): Promise<{ rol: string | null; fase: Enums<"fase_enum"> | null }> {
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user?.email) return { rol: null, fase: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = await createServiceClient() as any;
    const { data: userInfo } = await sb.from("usuarios_sistema").select("id,rol").eq("email", user.email).single();
    let faseAsignada = null;
    if (userInfo?.id) {
      const { data: ufa } = await sb.from("usuario_fases_asignadas").select("fase").eq("usuario_id", userInfo.id).eq("solo_lectura", false).limit(1).maybeSingle();
      if (ufa?.fase) faseAsignada = ufa.fase;
    }
    return {
      rol:  userInfo?.rol ?? null,
      fase: faseAsignada as Enums<"fase_enum"> | null,
    };
  } catch {
    return { rol: null, fase: null };
  }
}

export async function fetchUiPrefs(): Promise<AllUiPrefs> {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return {};
    const { data } = await sb
      .from("user_ui_prefs")
      .select("prefs")
      .eq("user_id", user.id)
      .maybeSingle();
    return (data?.prefs as AllUiPrefs) ?? {};
  } catch {
    return {};
  }
}
