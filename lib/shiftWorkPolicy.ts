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
