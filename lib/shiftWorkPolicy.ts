export function timeToMinutes(value: string) {
  const [h, m] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function shiftDurationMinutes(start: string, end: string) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return null;
  return e >= s ? e - s : 24 * 60 - s + e;
}

export function normalizeExtraHoursPolicy(value: unknown) {
  return String(value || "").trim().toLowerCase() === "no" ? "no" : "yes";
}

export function normalizeLoginAccessRule(value: unknown) {
  return String(value || "").trim().toLowerCase() === "shift_time_only" ? "shift_time_only" : "any_time";
}

export function normalizeHalfDayMinWorkMins(value: unknown, fallback = 240) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < 0 || rounded > 1440) return fallback;
  return rounded;
}

type ShiftTimingRule = {
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  earlyWindowMins: number;
};

function normalizeShiftText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function minutesOfDayInTimeZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const lookup = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
  return lookup("hour") * 60 + lookup("minute");
}

function isMinuteInWrappedRange(value: number, start: number, end: number) {
  if (start <= end) return value >= start && value <= end;
  return value >= start || value <= end;
}

export function findMatchingShiftRule<T extends ShiftTimingRule>(shiftName: string, shiftRows: T[]) {
  const normalizedShiftName = normalizeShiftText(shiftName);
  return (
    shiftRows.find((row) => {
      const name = normalizeShiftText(row.name);
      const type = normalizeShiftText(row.type);
      return normalizedShiftName ? normalizedShiftName === name || normalizedShiftName === type : false;
    }) ||
    shiftRows.find((row) => normalizeShiftText(row.name) === "general") ||
    shiftRows[0] ||
    null
  );
}

export function isPunchInAllowedByShiftWindow(params: {
  punchIso: string;
  timeZone: string;
  shiftStart: string;
  shiftEnd: string;
  earlyWindowMins: number;
}) {
  const shiftStartMin = timeToMinutes(params.shiftStart);
  const shiftEndMin = timeToMinutes(params.shiftEnd);
  if (shiftStartMin === null || shiftEndMin === null) return true;
  const currentMin = minutesOfDayInTimeZone(params.punchIso, params.timeZone);
  const earlyWindow = Math.max(0, Math.min(1440, Math.floor(params.earlyWindowMins || 0)));
  const windowStart = ((shiftStartMin - earlyWindow) % 1440 + 1440) % 1440;
  return isMinuteInWrappedRange(currentMin, windowStart, shiftEndMin);
}

export function applyExtraHoursPolicy(workMinutes: number, scheduledMinutes: number | null, policy: unknown) {
  const normalized = normalizeExtraHoursPolicy(policy);
  const safeWorked = Number.isFinite(workMinutes) && workMinutes > 0 ? Math.floor(workMinutes) : 0;
  const safeScheduled =
    typeof scheduledMinutes === "number" && Number.isFinite(scheduledMinutes) && scheduledMinutes > 0
      ? Math.floor(scheduledMinutes)
      : null;

  if (normalized === "no" && safeScheduled !== null) {
    return Math.min(safeWorked, safeScheduled);
  }

  return safeWorked;
}

export function workHoursLabel(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "-";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
