import { NextRequest, NextResponse } from "next/server";
import { resolveCorrectionPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import { formatMilitaryTimeInIndia, normalizeDateInputToIso } from "@/lib/dateTime";
import { resolveShiftPolicyRuntime } from "@/lib/companyPolicyRuntime";
import {
  dateRangeForIndiaIsoDate,
  expirePendingCorrections,
  isSameIndiaDate,
  monthRangeForIsoDate,
  rollbackPunchEventFromCorrection,
  upsertPunchEventFromCorrection,
  validateCorrectionReason,
  validateCorrectionWindowWithPolicy,
} from "@/lib/attendanceCorrections";
import { getMobileSessionContext } from "@/lib/mobileSession";

function clockToMinutes(value: string) {
  const text = String(value || "").trim();
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return "";
  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionToken?: string;
    correctionDate?: string;
    correction_date?: string;
    requestedCheckIn?: string;
    requested_check_in?: string;
    requestedCheckOut?: string;
    requested_check_out?: string;
    reason?: string;
  };

  const session = await getMobileSessionContext({
    sessionToken: body.sessionToken,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }
  await expirePendingCorrections(session.admin, session.employee.company_id);

  const correctionDateRaw = String(body.correctionDate || body.correction_date || "").trim();
  const correctionDate = normalizeDateInputToIso(correctionDateRaw);
  const requestedCheckIn = normalizeTime(body.requestedCheckIn || body.requested_check_in);
  const requestedCheckOut = normalizeTime(body.requestedCheckOut || body.requested_check_out);
  const reason = String(body.reason || "").trim();

  if (!correctionDateRaw) return NextResponse.json({ error: "Correction date is required." }, { status: 400 });
  if (!correctionDate) return NextResponse.json({ error: "Correction date is invalid. Use DD MMM YYYY." }, { status: 400 });
  const { fromIso, toIso } = dateRangeForIndiaIsoDate(correctionDate);

  const policyContext = await resolvePoliciesForEmployee(
    session.admin,
    session.employee.company_id,
    session.employee.id,
    correctionDate,
    ["correction", "shift"],
  );
  const correctionPolicy = resolveCorrectionPolicyRuntime(policyContext.resolved.correction);
  const shiftPolicy = resolveShiftPolicyRuntime(policyContext.resolved.shift, {
    shiftName: "General Shift",
  });
  const initialStatus =
    !correctionPolicy.approvalRequired
      ? "approved"
      : correctionPolicy.approvalFlow === "HR Approval"
        ? "pending_hr"
        : "pending_manager";

  if (!correctionPolicy.attendanceCorrectionEnabled) {
    return NextResponse.json({ error: "Attendance correction is disabled for your assigned policy." }, { status: 403 });
  }

  const windowError = validateCorrectionWindowWithPolicy({
    correctionDateIso: correctionDate,
    requestWindowDays: correctionPolicy.correctionRequestWindow,
    backdatedAllowed: correctionPolicy.backdatedCorrectionAllowed,
    maximumBackdatedDays: correctionPolicy.maximumBackdatedDays,
  });
  if (windowError) return NextResponse.json({ error: windowError }, { status: 400 });

  if (!requestedCheckIn && !requestedCheckOut) {
    return NextResponse.json({ error: "Requested check-in or check-out is required." }, { status: 400 });
  }
  if (requestedCheckIn && requestedCheckOut && requestedCheckOut <= requestedCheckIn) {
    return NextResponse.json({ error: "Punch out time must be later than punch in time." }, { status: 400 });
  }
  if (correctionPolicy.reasonMandatory) {
    const reasonError = validateCorrectionReason(reason);
    if (reasonError) return NextResponse.json({ error: reasonError }, { status: 400 });
  }

  const { data: dayEvents, error: dayEventsError } = await session.admin
    .from("attendance_punch_events")
    .select("punch_type,effective_punch_at,server_received_at,approval_status")
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .gte("effective_punch_at", fromIso)
    .lte("effective_punch_at", toIso)
    .order("server_received_at", { ascending: true });

  if (dayEventsError) {
    return NextResponse.json({ error: dayEventsError.message || "Unable to inspect correction day punches." }, { status: 400 });
  }

  const effectiveDayEvents = Array.isArray(dayEvents)
    ? dayEvents
        .filter((row) => row.approval_status !== "rejected")
        .filter((row) => {
          const sourceIso = row.effective_punch_at || row.server_received_at || "";
          return sourceIso ? isSameIndiaDate(sourceIso, correctionDate) : false;
        })
    : [];
  const existingCheckIn = effectiveDayEvents.find((row) => row.punch_type === "in");
  const existingCheckOut = [...effectiveDayEvents].reverse().find((row) => row.punch_type === "out");
  const existingCheckInTime = formatMilitaryTimeInIndia(existingCheckIn?.effective_punch_at || existingCheckIn?.server_received_at);
  const existingCheckOutTime = formatMilitaryTimeInIndia(existingCheckOut?.effective_punch_at || existingCheckOut?.server_received_at);
  const isMissingPunchRequest =
    (requestedCheckIn && !requestedCheckOut && !existingCheckIn) ||
    (!requestedCheckIn && requestedCheckOut && !existingCheckOut);

  if (isMissingPunchRequest && !correctionPolicy.missingPunchCorrectionAllowed) {
    return NextResponse.json({ error: "Missing punch correction is not allowed by your assigned policy." }, { status: 403 });
  }
  const existingCheckInMinutes = clockToMinutes(existingCheckInTime);
  const requestedCheckInMinutes = clockToMinutes(requestedCheckIn);
  const shiftStartMinutes = clockToMinutes(String(shiftPolicy.shiftStartTime || ""));
  const existingCheckOutMinutes = clockToMinutes(existingCheckOutTime);
  const requestedCheckOutMinutes = clockToMinutes(requestedCheckOut);
  const shiftEndMinutes = clockToMinutes(String(shiftPolicy.shiftEndTime || ""));
  const graceMinutes = Number(shiftPolicy.gracePeriod || 0);

  const isLatePunchRegularization =
    requestedCheckIn &&
    existingCheckInTime &&
    Number.isFinite(requestedCheckInMinutes) &&
    Number.isFinite(existingCheckInMinutes) &&
    requestedCheckInMinutes < existingCheckInMinutes &&
    (
      !Number.isFinite(shiftStartMinutes) ||
      existingCheckInMinutes > shiftStartMinutes + graceMinutes
    );
  const isEarlyGoRegularization =
    requestedCheckOut &&
    existingCheckOutTime &&
    Number.isFinite(requestedCheckOutMinutes) &&
    Number.isFinite(existingCheckOutMinutes) &&
    requestedCheckOutMinutes > existingCheckOutMinutes &&
    (
      !Number.isFinite(shiftEndMinutes) ||
      existingCheckOutMinutes < shiftEndMinutes
    );

  if (isLatePunchRegularization && !correctionPolicy.latePunchRegularizationAllowed) {
    return NextResponse.json({ error: "Late punch regularization is not allowed by your assigned policy." }, { status: 403 });
  }
  if (isEarlyGoRegularization && !correctionPolicy.earlyGoRegularizationAllowed) {
    return NextResponse.json({ error: "Early go regularization is not allowed by your assigned policy." }, { status: 403 });
  }

  const { data: pendingDuplicate, error: duplicateError } = await session.admin
    .from("employee_attendance_corrections")
    .select("id")
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .eq("correction_date", correctionDate)
    .in("status", ["pending", "pending_manager", "pending_hr"])
    .maybeSingle();
  if (duplicateError) {
    return NextResponse.json({ error: duplicateError.message || "Unable to validate duplicate request." }, { status: 400 });
  }
  if (pendingDuplicate?.id) {
    return NextResponse.json({ error: "A pending correction request already exists for this date." }, { status: 409 });
  }

  const monthRange = monthRangeForIsoDate(correctionDate);
  const monthlyLimitQuery = session.admin
    .from("employee_attendance_corrections")
    .select("id", { count: "exact", head: true })
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .gte("correction_date", monthRange.start)
    .lte("correction_date", monthRange.end)
    .in("status", ["pending", "pending_manager", "pending_hr", "approved"]);
  const { count, error: countError } = await monthlyLimitQuery;
  if (countError) {
    return NextResponse.json({ error: countError.message || "Unable to validate monthly limit." }, { status: 400 });
  }
  if (Number(count || 0) >= correctionPolicy.maximumRequestsPerMonth) {
    const nowIso = new Date().toISOString();
    await session.admin.from("employee_attendance_correction_audit_logs").insert({
      correction_id: null,
      company_id: session.employee.company_id,
      employee_id: session.employee.id,
      action: "blocked_monthly_limit",
      old_status: null,
      new_status: null,
      old_requested_check_in: null,
      new_requested_check_in: requestedCheckIn || null,
      old_requested_check_out: null,
      new_requested_check_out: requestedCheckOut || null,
      reason_snapshot: reason,
      performed_by: session.employee.id,
      performed_role: "employee",
      remark: `Monthly limit exceeded (${correctionPolicy.maximumRequestsPerMonth}).`,
      created_at: nowIso,
    });
    return NextResponse.json({ error: `Monthly correction limit reached (${correctionPolicy.maximumRequestsPerMonth}). Contact company admin.` }, { status: 429 });
  }

  const nowIso = new Date().toISOString();
  const nextStatus = initialStatus;
  const autoRemark = correctionPolicy.approvalRequired ? null : "Auto-approved as per assigned correction policy.";
  const autoApproved = !correctionPolicy.approvalRequired;

  const { data, error } = await session.admin
    .from("employee_attendance_corrections")
    .insert({
      company_id: session.employee.company_id,
      employee_id: session.employee.id,
      correction_date: correctionDate,
      requested_check_in: requestedCheckIn || null,
      requested_check_out: requestedCheckOut || null,
      reason,
      status: autoApproved ? "pending" : nextStatus,
      admin_remark: null,
      reviewed_at: null,
      reviewed_by: null,
      submitted_at: nowIso,
      updated_at: nowIso,
    })
    .select("id,correction_date,requested_check_in,requested_check_out,reason,status,admin_remark,submitted_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to submit correction request." }, { status: 400 });
  }

  if (autoApproved) {
    const rollbackActions = [];

    const checkInApplyResult = await upsertPunchEventFromCorrection({
      admin: session.admin,
      companyId: session.employee.company_id,
      employeeId: session.employee.id,
      correctionDate,
      requestedTime: requestedCheckIn || null,
      punchType: "in",
      performedBy: session.employee.id,
      correctionId: data.id,
    });
    if (checkInApplyResult.error) {
      await session.admin
        .from("employee_attendance_corrections")
        .delete()
        .eq("company_id", session.employee.company_id)
        .eq("id", data.id);
      return NextResponse.json({ error: checkInApplyResult.error }, { status: 400 });
    }
    if (checkInApplyResult.rollbackAction) rollbackActions.push(checkInApplyResult.rollbackAction);

    const checkOutApplyResult = await upsertPunchEventFromCorrection({
      admin: session.admin,
      companyId: session.employee.company_id,
      employeeId: session.employee.id,
      correctionDate,
      requestedTime: requestedCheckOut || null,
      punchType: "out",
      performedBy: session.employee.id,
      correctionId: data.id,
    });
    if (checkOutApplyResult.error) {
      for (const rollbackAction of rollbackActions.reverse()) {
        await rollbackPunchEventFromCorrection({
          admin: session.admin,
          companyId: session.employee.company_id,
          employeeId: session.employee.id,
          rollbackAction,
        });
      }
      await session.admin
        .from("employee_attendance_corrections")
        .delete()
        .eq("company_id", session.employee.company_id)
        .eq("id", data.id);
      return NextResponse.json({ error: checkOutApplyResult.error }, { status: 400 });
    }
    if (checkOutApplyResult.rollbackAction) rollbackActions.push(checkOutApplyResult.rollbackAction);

    const { error: finalizeError } = await session.admin
      .from("employee_attendance_corrections")
      .update({
        status: "approved",
        admin_remark: autoRemark,
        reviewed_at: nowIso,
        reviewed_by: "policy_auto",
        updated_at: nowIso,
      })
      .eq("company_id", session.employee.company_id)
      .eq("id", data.id)
      .eq("status", "pending");

    if (finalizeError) {
      for (const rollbackAction of rollbackActions.reverse()) {
        await rollbackPunchEventFromCorrection({
          admin: session.admin,
          companyId: session.employee.company_id,
          employeeId: session.employee.id,
          rollbackAction,
        });
      }
      await session.admin
        .from("employee_attendance_corrections")
        .delete()
        .eq("company_id", session.employee.company_id)
        .eq("id", data.id);
      return NextResponse.json({ error: finalizeError.message || "Unable to finalize auto-approved correction request." }, { status: 400 });
    }
  }

  await session.admin.from("employee_attendance_correction_audit_logs").insert({
    correction_id: data.id,
    company_id: session.employee.company_id,
    employee_id: session.employee.id,
    action: "submitted",
    old_status: null,
    new_status: nextStatus,
    old_requested_check_in: null,
    new_requested_check_in: requestedCheckIn || null,
    old_requested_check_out: null,
    new_requested_check_out: requestedCheckOut || null,
    reason_snapshot: reason,
    performed_by: session.employee.id,
    performed_role: "employee",
    remark:
      autoRemark ||
      (nextStatus === "pending_manager"
        ? "Submitted for manager approval as per assigned correction policy."
        : nextStatus === "pending_hr"
          ? "Submitted for HR approval as per assigned correction policy."
          : null),
    created_at: nowIso,
  });

  return NextResponse.json({
    ok: true,
    request: {
      id: data.id,
      correctionDate: data.correction_date,
      requestedCheckIn: data.requested_check_in,
      requestedCheckOut: data.requested_check_out,
      reason: data.reason,
      status: autoApproved ? "approved" : data.status,
      adminRemark: autoApproved ? autoRemark : data.admin_remark,
      submittedAt: data.submitted_at,
    },
  });
}
