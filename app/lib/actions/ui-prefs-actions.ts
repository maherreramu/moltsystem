"use server";

import { createClient } from "@/lib/supabase/server";
import type { ViewPrefs } from "@/lib/queries/ui-prefs";

export async function saveUiPrefs(viewKey: string, patch: Partial<ViewPrefs>): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = await createClient();
    const { error } = await sb.rpc("save_ui_pref" as never, {
      p_view_key: viewKey,
      p_patch: patch,
    } as never);
    if (error) return { ok: false, error: (error as { message: string }).message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
