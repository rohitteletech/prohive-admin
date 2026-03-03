import { createClient, SupabaseClient } from "@supabase/supabase-js";

type Database = any;

let adminClient: SupabaseClient<Database> | null = null;

function isServiceRoleKey(key: string) {
  if (key.startsWith("sb_secret_")) return true;
  try {
    const parts = key.split(".");
    if (parts.length < 2) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!url || !serviceRoleKey || !isServiceRoleKey(serviceRoleKey)) return null;

  adminClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return adminClient;
}
