import { isoDateInIndia, todayISOInIndia } from "@/lib/dateTime";

export const CORRECTION_AUTO_REJECT_REMARK = "Auto-rejected: no action by company admin within 48 hours.";
export const CORRECTION_AUTO_REJECT_BY = "system_auto";
export const CORRECTION_GENERIC_REASONS = new Set(["ok", "test", "na", "n/a", "none"]);

function isoDateToUtcMs(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    return Number.NaN;
  }
  return ms;
}

export function shiftIsoDate(iso: string, deltaDays: number) {
  const ms = isoDateToUtcMs(iso);
  if (!Number.isFinite(ms)) return "";
  const next = new Date(ms + deltaDays * 86400000);
  return next.toISOString().slice(0, 10);
}

export function monthRangeForIsoDate(iso: string) {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { start: "", end: "" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthStart = `${String(nextMonthYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end: shiftIsoDate(nextMonthStart, -1) };
}

export function normalizeCorrectionReason(raw: string) {
  const normalized = raw.trim();
  const compact = normalized.toLowerCase().replace(/[\s._-]+/g, "");
  return { normalized, compact };
}

export function validateCorrectionReason(raw: string) {
  const { normalized, compact } = normalizeCorrectionReason(raw);
  if (normalized.length < 10 || normalized.length > 300) {
    return "Reason must be between 10 and 300 characters.";
  }
  if (CORRECTION_GENERIC_REASONS.has(compact)) {
    return "Please provide a detailed reason.";
  }
  return "";
}

export function validateCorrectionWindow(correctionDateIso: string) {
  const todayIso = todayISOInIndia();
  const minIso = shiftIsoDate(todayIso, -2);
  if (!minIso) return "Correction window validation failed.";
  if (correctionDateIso > todayIso) return "Correction date cannot be in the future.";
  if (correctionDateIso < minIso) return "Correction is allowed only for today and previous 2 days.";
  return "";
}

export function dateRangeForIndiaIsoDate(isoDate: string) {
  const start = new Date(`${isoDate}T00:00:00+05:30`);
  const end = new Date(`${isoDate}T23:59:59.999+05:30`);
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  };
}

export function correctionTimeToIso(correctionDate: string, value: string | null) {
  if (!value) return null;
  const hhmmss = String(value).slice(0, 8);
  if (!/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(hhmmss)) return null;
  const date = new Date(`${correctionDate}T${hhmmss}+05:30`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function isSameIndiaDate(iso: string, correctionDateIso: string) {
  return isoDateInIndia(iso) === correctionDateIso;
}

export async function expirePendingCorrections(admin: any, companyId?: string) {
  const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  let query = admin
    .from("employee_attendance_corrections")
    .select("id,company_id,employee_id,status,requested_check_in,requested_check_out,reason")
    .eq("status", "pending")
    .lte("submitted_at", threshold);
  if (companyId) {
    query = query.eq("company_id", companyId);
  }
  const { data: expiringRows, error: selectError } = await query;
  if (selectError) return String(selectError.message || "Unable to scan expired correction requests.");
  if (!Array.isArray(expiringRows) || expiringRows.length === 0) return "";

  const payload = {
    status: "rejected",
    admin_remark: CORRECTION_AUTO_REJECT_REMARK,
    reviewed_at: new Date().toISOString(),
    reviewed_by: CORRECTION_AUTO_REJECT_BY,
    updated_at: new Date().toISOString(),
  };
  let updateQuery = admin
    .from("employee_attendance_corrections")
    .update(payload)
    .eq("status", "pending")
    .lte("submitted_at", threshold);
  if (companyId) {
    updateQuery = updateQuery.eq("company_id", companyId);
  }
  const { error } = await updateQuery;
  if (error) return String(error.message || "Unable to auto-reject expired correction requests.");

  await admin.from("employee_attendance_correction_audit_logs").insert(
    expiringRows.map((row) => ({
      correction_id: row.id,
      company_id: row.company_id,
      employee_id: row.employee_id,
      action: "auto_rejected",
      old_status: row.status,
      new_status: "rejected",
      old_requested_check_in: row.requested_check_in,
      new_requested_check_in: row.requested_check_in,
      old_requested_check_out: row.requested_check_out,
      new_requested_check_out: row.requested_check_out,
      reason_snapshot: row.reason,
      performed_by: CORRECTION_AUTO_REJECT_BY,
      performed_role: "system",
      remark: CORRECTION_AUTO_REJECT_REMARK,
      created_at: new Date().toISOString(),
    }))
  );
  return "";
}
