"use client";

export type CompanyShift = {
  id: string;
  name: string;
  type: string;
  start: string;
  end: string;
  graceMins: number;
  active: boolean;
};

export const COMPANY_SHIFT_STORAGE_KEY = "phv_company_shifts_v1";

export const DEFAULT_COMPANY_SHIFTS: CompanyShift[] = [
  {
    id: "default-general",
    name: "General",
    type: "Day",
    start: "09:00",
    end: "18:00",
    graceMins: 10,
    active: true,
  },
  {
    id: "default-morning",
    name: "Morning",
    type: "Early",
    start: "06:00",
    end: "15:00",
    graceMins: 10,
    active: true,
  },
  {
    id: "default-evening",
    name: "Evening",
    type: "Late",
    start: "14:00",
    end: "22:00",
    graceMins: 10,
    active: true,
  },
];

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
    return parsed as CompanyShift[];
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
  const names = shifts.filter((s) => s.active).map((s) => s.name.trim()).filter(Boolean);
  return names;
}
