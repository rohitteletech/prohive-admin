"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

type AuthScope = "super" | "company" | "default";

const browserClients: Partial<Record<AuthScope, SupabaseClient>> = {};

function env() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "",
  };
}

export function hasSupabaseEnv() {
  const { url, anonKey } = env();
  return Boolean(url && anonKey);
}

export function getSupabaseBrowserClient(scope: AuthScope = "default") {
  if (browserClients[scope]) return browserClients[scope] as SupabaseClient;
  const { url, anonKey } = env();
  if (!url || !anonKey) return null;
  const storageKey =
    scope === "super" ? "phv-sb-super-auth" : scope === "company" ? "phv-sb-company-auth" : "phv-sb-auth";
  browserClients[scope] = createClient(url, anonKey, {
    auth: {
      storageKey,
    },
  });
  return browserClients[scope] as SupabaseClient;
}
