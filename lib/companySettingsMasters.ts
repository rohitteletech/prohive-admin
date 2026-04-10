export const MAX_MASTER_ITEMS = 100;
export const MAX_MASTER_ITEM_LENGTH = 60;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeMasterList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const unique = new Map<string, string>();
  for (const entry of values) {
    if (typeof entry !== "string") continue;
    const normalized = normalizeWhitespace(entry);
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase("en-US");
    if (normalized.length > MAX_MASTER_ITEM_LENGTH) continue;
    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
    if (unique.size >= MAX_MASTER_ITEMS) break;
  }

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
}

export function isAllowedMasterValue(value: unknown, allowed: string[]) {
  if (typeof value !== "string") return false;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return false;
  return allowed.some((item) => item.localeCompare(normalized, undefined, { sensitivity: "accent" }) === 0);
}

export type CompanyMasterSettings = {
  departmentOptions: string[];
  designationOptions: string[];
};

export async function loadCompanyMasterSettings(accessToken: string): Promise<CompanyMasterSettings> {
  if (!accessToken) {
    return { departmentOptions: [], designationOptions: [] };
  }

  const response = await fetch("/api/company/settings", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const result = (await response.json().catch(() => ({}))) as {
    department_options?: string[];
    designation_options?: string[];
  };

  return {
    departmentOptions: normalizeMasterList(result.department_options),
    designationOptions: normalizeMasterList(result.designation_options),
  };
}
