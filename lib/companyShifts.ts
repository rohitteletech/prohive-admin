"use client";

import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";

export type CompanyShift = {
  id: string;
  name: string;
  type: string;
  start: string;
  end: string;
  graceMins: number;
  earlyWindowMins: number;
  minWorkBeforeOutMins: number;
  active: boolean;
};

export const COMPANY_SHIFT_STORAGE_KEY = "phv_company_shifts_v1";
export { DEFAULT_COMPANY_SHIFTS };

function normalizeShift(row: Partial<CompanyShift>, fallback: CompanyShift): CompanyShift {
  return {
    id: String(row.id || fallback.id),
    name: String(row.name || fallback.name),
    type: String(row.type || fallback.type),
    start: String(row.start || fallback.start),
    end: String(row.end || fallback.end),
    graceMins: Number.isFinite(Number(row.graceMins)) ? Number(row.graceMins) : fallback.graceMins,
    earlyWindowMins: Number.isFinite(Number(row.earlyWindowMins))
      ? Number(row.earlyWindowMins)
      : fallback.earlyWindowMins,
    minWorkBeforeOutMins: Number.isFinite(Number(row.minWorkBeforeOutMins))
      ? Number(row.minWorkBeforeOutMins)
      : fallback.minWorkBeforeOutMins,
    active: typeof row.active === "boolean" ? row.active : fallback.active,
  };
}

function hasWindow() {
  return typeof window !== "undefined";
}

export function loadCompanyShifts(): CompanyShift[] {
  if (!hasWindow()) return DEFAULT_COMPANY_SHIFTS;
  const raw = window.localStorage.getItem(COMPANY_SHIFT_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_COMPANY_SHIFTS;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_COMPANY_SHIFTS;
    return parsed.map((row, index) => normalizeShift(row as Partial<CompanyShift>, DEFAULT_COMPANY_SHIFTS[index] || DEFAULT_COMPANY_SHIFTS[0]));
  } catch {
    return DEFAULT_COMPANY_SHIFTS;
  }
}

export function saveCompanyShifts(rows: CompanyShift[]) {
  if (!hasWindow()) return;
  window.localStorage.setItem(COMPANY_SHIFT_STORAGE_KEY, JSON.stringify(rows));
}

export function loadActiveShiftNames() {
  const shifts = loadCompanyShifts();
  const seen = new Set<string>();
  return shifts
    .filter((s) => s.active)
    .map((s) => s.name.trim())
    .filter((name) => {
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
