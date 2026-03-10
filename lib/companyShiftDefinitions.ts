import { CompanyShift, DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShifts";

type CompanyShiftDbRow = {
  id: string;
  name: string;
  type: string;
  start_time: string;
  end_time: string;
  grace_mins: number;
  early_window_mins: number;
  min_work_before_out_mins: number;
  active: boolean;
};

function normalizeTime(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function normalizeInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function sanitizeCompanyShiftRows(input: unknown): CompanyShift[] {
  if (!Array.isArray(input)) {
    throw new Error("Invalid shift payload.");
  }

  return input.map((raw, index) => {
    const row = (raw || {}) as Record<string, unknown>;
    const fallback = DEFAULT_COMPANY_SHIFTS[index] || DEFAULT_COMPANY_SHIFTS[0];
    const name = String(row.name || "").trim();
    const type = String(row.type || "").trim();
    const start = normalizeTime(row.start, fallback.start);
    const end = normalizeTime(row.end, fallback.end);
    const graceMins = normalizeInt(row.graceMins, fallback.graceMins);
    const earlyWindowMins = normalizeInt(row.earlyWindowMins, fallback.earlyWindowMins);
    const minWorkBeforeOutMins = normalizeInt(row.minWorkBeforeOutMins, fallback.minWorkBeforeOutMins);

    if (!name) throw new Error(`Shift #${index + 1}: name is required.`);
    if (!type) throw new Error(`Shift #${index + 1}: type is required.`);
    if (graceMins < 0 || graceMins > 120) throw new Error(`Shift ${name}: grace minutes must be between 0 and 120.`);
    if (earlyWindowMins < 0 || earlyWindowMins > 240) throw new Error(`Shift ${name}: early window must be between 0 and 240.`);
    if (minWorkBeforeOutMins < 0 || minWorkBeforeOutMins > 1440) {
      throw new Error(`Shift ${name}: min work before out must be between 0 and 1440.`);
    }

    return {
      id: String(row.id || fallback.id),
      name,
      type,
      start,
      end,
      graceMins,
      earlyWindowMins,
      minWorkBeforeOutMins,
      active: row.active !== false,
    };
  });
}

export function shiftFromDb(row: CompanyShiftDbRow): CompanyShift {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    start: row.start_time,
    end: row.end_time,
    graceMins: Number(row.grace_mins || 0),
    earlyWindowMins: Number(row.early_window_mins || 0),
    minWorkBeforeOutMins: Number(row.min_work_before_out_mins || 0),
    active: row.active !== false,
  };
}

export function shiftToDb(row: CompanyShift, companyId: string) {
  return {
    id: row.id,
    company_id: companyId,
    name: row.name,
    type: row.type,
    start_time: row.start,
    end_time: row.end,
    grace_mins: row.graceMins,
    early_window_mins: row.earlyWindowMins,
    min_work_before_out_mins: row.minWorkBeforeOutMins,
    active: row.active,
  };
}
