import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};

  if (typeof body.isActive === "boolean") payload.is_active = body.isActive;
  if (body.effectiveTo === null) {
    payload.effective_to = null;
  } else if (typeof body.effectiveTo === "string" && body.effectiveTo.trim()) {
    payload.effective_to = body.effectiveTo.trim();
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No assignment fields provided." }, { status: 400 });
  }

  const { data: existingAssignment, error: existingAssignmentError } = await context.admin
    .from("company_policy_assignments")
    .select("id,policy_type,assignment_level,target_id,effective_from,effective_to,is_active")
    .eq("company_id", context.companyId)
    .eq("id", id)
    .maybeSingle();

  if (existingAssignmentError || !existingAssignment?.id) {
    return NextResponse.json({ error: existingAssignmentError?.message || "Policy assignment not found." }, { status: 404 });
  }

  const nextIsActive = typeof payload.is_active === "boolean" ? payload.is_active : Boolean(existingAssignment.is_active);
  const nextEffectiveFrom = String(existingAssignment.effective_from || "").trim();
  const nextEffectiveTo =
    payload.effective_to === null
      ? null
      : typeof payload.effective_to === "string"
        ? payload.effective_to
        : (existingAssignment.effective_to ? String(existingAssignment.effective_to).trim() : null);

  if (nextEffectiveTo && nextEffectiveTo < nextEffectiveFrom) {
    return NextResponse.json({ error: "Effective To date cannot be earlier than Effective From date." }, { status: 400 });
  }

  if (nextIsActive) {
    const { data: overlappingAssignments, error: overlapError } = await context.admin
      .from("company_policy_assignments")
      .select("id,effective_from,effective_to")
      .eq("company_id", context.companyId)
      .eq("policy_type", existingAssignment.policy_type)
      .eq("assignment_level", existingAssignment.assignment_level)
      .eq("target_id", existingAssignment.target_id)
      .eq("is_active", true)
      .neq("id", id);

    if (overlapError) {
      return NextResponse.json({ error: overlapError.message || "Unable to validate policy assignment overlap." }, { status: 400 });
    }

    const nextEnd = nextEffectiveTo || "9999-12-31";
    const hasOverlap = (overlappingAssignments || []).some((assignment) => {
      const existingEnd = assignment.effective_to || "9999-12-31";
      return String(assignment.effective_from || "") <= nextEnd && nextEffectiveFrom <= existingEnd;
    });

    if (hasOverlap) {
      return NextResponse.json({ error: "An active assignment already exists for this target and policy type in the selected date range." }, { status: 400 });
    }
  }

  const { data, error } = await context.admin
    .from("company_policy_assignments")
    .update(payload)
    .eq("company_id", context.companyId)
    .eq("id", id)
    .select("id,company_id,policy_type,policy_id,assignment_level,target_id,effective_from,effective_to,is_active,created_by,created_at,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to update policy assignment." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, assignment: data });
}
