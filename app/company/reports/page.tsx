"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate, INDIA_TIME_ZONE, todayISOInIndia } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ReportKey = "attendance" | "late_penalty" | "leaves" | "claims" | "corrections" | "employees";
type DateMode = "monthly" | "date_range";

type MonthOption = {
  key: string;
  label: string;
  startISO: string;
  endISO: string;
};

type ReportCard = {
  key: ReportKey;
  title: string;
  category: string;
  description: string;
  status: "ready_next" | "planned";
  primaryMetric: string;
  primaryLabel: string;
  exports: string[];
  includes: string[];
};

type AttendancePreviewRow = {
  id: string;
  employee: string;
  department: string;
  shift: string;
  date: string;
  checkIn: string;
  checkOut: string;
  workHours: string;
  status: "present" | "late" | "half_day" | "absent";
};

type AttendanceSummary = {
  total: number;
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  latePenaltyDays: number;
};

type LatePenaltyPreviewRow = {
  id: string;
  employee: string;
  employeeCode: string;
  department: string;
  shift: string;
  lateCount: number;
  lateUpToCount: number;
  lateAboveCount: number;
  penaltyDays: number;
  ruleApplied: string;
};

type LatePenaltySummary = {
  total: number;
  totalLateMarks: number;
  totalLateUpTo: number;
  totalLateAbove: number;
  totalPenaltyDays: number;
};

type LeavePreviewRow = {
  id: string;
  employee: string;
  employeeCode: string;
  department: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  paidDays: number;
  unpaidDays: number;
  status: "pending" | "approved" | "rejected";
  availableBalance: number;
  submittedAt: string;
};

type LeaveSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  totalAvailableBalance: number;
};

type ClaimPreviewRow = {
  id: string;
  employee: string;
  employeeCode: string;
  department: string;
  claimType: string;
  amount: number;
  reason: string;
  fromDate: string;
  toDate: string;
  days: number;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  attachment: boolean;
};

type ClaimSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  totalAmount: number;
};

type CorrectionPreviewRow = {
  id: string;
  employee: string;
  employeeCode: string;
  correctionDateIso: string;
  correctionDate: string;
  requestedIn: string;
  requestedOut: string;
  reason: string;
  submittedAt: string;
  submittedDate: string;
  submittedTime: string;
  status: "pending" | "approved" | "rejected";
  adminRemark?: string;
};

type CorrectionSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

type EmployeePreviewRow = {
  id: string;
  employee: string;
  employeeCode: string;
  department: string;
  designation: string;
  shift: string;
  mobile: string;
  status: "active" | "inactive";
  joinedOn: string;
  mobileAppStatus: string;
  attendanceMode: string;
};

type EmployeeSummary = {
  total: number;
  active: number;
  inactive: number;
  mobileActive: number;
};

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthBounds(y: number, mIndex: number) {
  const start = new Date(y, mIndex, 1);
  const end = new Date(y, mIndex + 1, 0);
  return { startISO: toISODate(start), endISO: toISODate(end) };
}

function buildLast3CompleteMonths(today: Date): MonthOption[] {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const out: MonthOption[] = [];

  for (let i = 3; i >= 1; i -= 1) {
    const d = new Date(firstDayCurrentMonth);
    d.setMonth(firstDayCurrentMonth.getMonth() - i);
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const { startISO, endISO } = getMonthBounds(y, m);
    out.push({
      key,
      label: `${monthNames[m]} ${y}`,
      startISO,
      endISO,
    });
  }
  return out;
}

function statusBadge(status: ReportCard["status"]) {
  if (status === "ready_next") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function statusLabel(status: ReportCard["status"]) {
  return status === "ready_next" ? "Build Next" : "Planned";
}

function attendanceStatusChip(status: AttendancePreviewRow["status"]) {
  if (status === "present") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "late") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "half_day") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function leaveStatusChip(status: LeavePreviewRow["status"]) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function readStoredCompanyId() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("phv_company");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { id?: string | null };
    return parsed?.id || "";
  } catch {
    return "";
  }
}

export default function Page() {
  const today = useMemo(() => new Date(`${todayISOInIndia()}T00:00:00+05:30`), []);
  const yesterday = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d;
  }, [today]);
  const yesterdayISO = useMemo(() => toISODate(yesterday), [yesterday]);
  const monthOptions = useMemo(() => buildLast3CompleteMonths(today), [today]);
  const defaultMonth = monthOptions[monthOptions.length - 1] || monthOptions[0];
  const firstAvailableDate = "2025-11-01";

  const reports = useMemo<ReportCard[]>(
    () => [
      {
        key: "attendance",
        title: "Attendance Reports",
        category: "Operations",
        description: "Daily and monthly attendance reporting for payroll support, late marks, and work hours review.",
        status: "ready_next",
        primaryMetric: "01",
        primaryLabel: "Highest priority",
        exports: ["CSV", "XLSX"],
        includes: ["Present / Late / Absent", "Check-in / Check-out", "Work hours", "Shift-wise filters"],
      },
      {
        key: "late_penalty",
        title: "Late Penalty Report",
        category: "HR Policy",
        description: "Employee-wise late marks, bracket counts, and calculated penalty days for the selected period.",
        status: "ready_next",
        primaryMetric: "02",
        primaryLabel: "Preview + export ready",
        exports: ["CSV"],
        includes: ["Late count", "Up to / above bracket split", "Penalty days", "Rule applied"],
      },
      {
        key: "leaves",
        title: "Leave Reports",
        category: "HR",
        description: "Leave balance, approvals, pending requests, and policy-wise leave usage summaries.",
        status: "ready_next",
        primaryMetric: "03",
        primaryLabel: "Preview + export ready",
        exports: ["CSV", "XLSX"],
        includes: ["Leave balance", "Approved / Pending", "Policy-wise usage", "Employee-wise summary"],
      },
      {
        key: "claims",
        title: "Claims Reports",
        category: "Finance Support",
        description: "Claims register with amount, type, approval status, and processing turnaround tracking.",
        status: "ready_next",
        primaryMetric: "04",
        primaryLabel: "Preview ready",
        exports: ["CSV", "PDF"],
        includes: ["Claim type", "Amount", "Approval status", "Submitted / reviewed dates"],
      },
      {
        key: "corrections",
        title: "Corrections Audit",
        category: "Compliance",
        description: "Attendance correction audit trail for manager review, remark visibility, and approval tracking.",
        status: "ready_next",
        primaryMetric: "05",
        primaryLabel: "Preview ready",
        exports: ["CSV", "PDF"],
        includes: ["Requested change", "Approval status", "Admin remark", "Audit-ready history"],
      },
      {
        key: "employees",
        title: "Employee Master",
        category: "HR Master",
        description: "Employee directory, status, department, shift, and mobile-app readiness for HR operations.",
        status: "ready_next",
        primaryMetric: "06",
        primaryLabel: "Preview ready",
        exports: ["CSV", "XLSX"],
        includes: ["Employee directory", "Department and shift", "Joining date", "Mobile app status"],
      },
    ],
    []
  );

  const [selectedReport, setSelectedReport] = useState<ReportKey>("attendance");
  const [dateMode, setDateMode] = useState<DateMode>("monthly");
  const [monthKey, setMonthKey] = useState(defaultMonth?.key || "");
  const [startDate, setStartDate] = useState(firstAvailableDate);
  const [endDate, setEndDate] = useState(yesterdayISO);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [previewRows, setPreviewRows] = useState<AttendancePreviewRow[]>([]);
  const [previewSummary, setPreviewSummary] = useState<AttendanceSummary>({
    total: 0,
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    latePenaltyDays: 0,
  });
  const [latePenaltyPreviewRows, setLatePenaltyPreviewRows] = useState<LatePenaltyPreviewRow[]>([]);
  const [latePenaltySummary, setLatePenaltySummary] = useState<LatePenaltySummary>({
    total: 0,
    totalLateMarks: 0,
    totalLateUpTo: 0,
    totalLateAbove: 0,
    totalPenaltyDays: 0,
  });
  const [leavePreviewRows, setLeavePreviewRows] = useState<LeavePreviewRow[]>([]);
  const [leaveSummary, setLeaveSummary] = useState<LeaveSummary>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    totalAvailableBalance: 0,
  });
  const [claimPreviewRows, setClaimPreviewRows] = useState<ClaimPreviewRow[]>([]);
  const [claimSummary, setClaimSummary] = useState<ClaimSummary>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    totalAmount: 0,
  });
  const [correctionPreviewRows, setCorrectionPreviewRows] = useState<CorrectionPreviewRow[]>([]);
  const [correctionSummary, setCorrectionSummary] = useState<CorrectionSummary>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [employeePreviewRows, setEmployeePreviewRows] = useState<EmployeePreviewRow[]>([]);
  const [employeeSummary, setEmployeeSummary] = useState<EmployeeSummary>({
    total: 0,
    active: 0,
    inactive: 0,
    mobileActive: 0,
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const selected = reports.find((item) => item.key === selectedReport) || reports[0];
  const selectedMonth = monthOptions.find((item) => item.key === monthKey) || defaultMonth;
  const currentPreviewCount =
    selectedReport === "attendance"
      ? previewSummary.total
      : selectedReport === "late_penalty"
        ? latePenaltySummary.total
        : selectedReport === "leaves"
        ? leaveSummary.total
        : selectedReport === "claims"
          ? claimSummary.total
          : selectedReport === "corrections"
            ? correctionSummary.total
            : employeeSummary.total;
  const exportReady =
    (selectedReport === "attendance" && previewRows.length > 0)
    || (selectedReport === "late_penalty" && latePenaltyPreviewRows.length > 0)
    || (selectedReport === "leaves" && leavePreviewRows.length > 0)
    || (selectedReport === "claims" && claimPreviewRows.length > 0)
    || (selectedReport === "corrections" && correctionPreviewRows.length > 0)
    || (selectedReport === "employees" && employeePreviewRows.length > 0);

  const scopeLabel =
    dateMode === "monthly"
      ? `${selectedMonth?.label || "-"}`
      : `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`;

  useEffect(() => {
    setPreviewError(null);
    setStatus("all");
    setEmployeeQuery("");
  }, [selectedReport]);

  async function handleGeneratePreview() {
    if (
      selectedReport !== "attendance"
      && selectedReport !== "late_penalty"
      && selectedReport !== "leaves"
      && selectedReport !== "claims"
      && selectedReport !== "corrections"
      && selectedReport !== "employees"
    ) {
      setPreviewRows([]);
      setLatePenaltyPreviewRows([]);
      setLeavePreviewRows([]);
      setClaimPreviewRows([]);
      setCorrectionPreviewRows([]);
      setEmployeePreviewRows([]);
      setPreviewSummary({ total: 0, present: 0, late: 0, halfDay: 0, absent: 0, latePenaltyDays: 0 });
      setLatePenaltySummary({ total: 0, totalLateMarks: 0, totalLateUpTo: 0, totalLateAbove: 0, totalPenaltyDays: 0 });
      setLeaveSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAvailableBalance: 0 });
      setClaimSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 });
      setCorrectionSummary({ total: 0, pending: 0, approved: 0, rejected: 0 });
      setEmployeeSummary({ total: 0, active: 0, inactive: 0, mobileActive: 0 });
      setPreviewError("Live preview is currently enabled only for Attendance, Late Penalty, Leave, Claims, Corrections, and Employee Master reports.");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token || "";
      const companyId = readStoredCompanyId();

      if (!accessToken) {
        throw new Error("Company session not found. Please login again.");
      }

      const endpoint =
        selectedReport === "attendance"
          ? "/api/company/reports/attendance/preview"
          : selectedReport === "late_penalty"
            ? "/api/company/reports/late-penalty/preview"
          : selectedReport === "leaves"
            ? "/api/company/reports/leaves/preview"
            : selectedReport === "claims"
              ? "/api/company/reports/claims/preview"
              : selectedReport === "corrections"
                ? "/api/company/reports/corrections/preview"
                : "/api/company/reports/employees/preview";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(companyId ? { "x-company-id": companyId } : {}),
        },
        body: JSON.stringify({
          mode: dateMode,
          monthKey,
          startDate,
          endDate,
          employeeQuery,
          department,
          status,
          timeZone: INDIA_TIME_ZONE,
        }),
      });

      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(String(json.error || "Unable to load report preview."));
      }

      if (selectedReport === "attendance") {
        const rows = Array.isArray(json.rows) ? (json.rows as AttendancePreviewRow[]) : [];
        setPreviewRows(rows);
        setLatePenaltyPreviewRows([]);
        setLeavePreviewRows([]);
        setClaimPreviewRows([]);
        setCorrectionPreviewRows([]);
        setEmployeePreviewRows([]);
        setLatePenaltySummary({ total: 0, totalLateMarks: 0, totalLateUpTo: 0, totalLateAbove: 0, totalPenaltyDays: 0 });
        setLeaveSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAvailableBalance: 0 });
        setClaimSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 });
        setCorrectionSummary({ total: 0, pending: 0, approved: 0, rejected: 0 });
        setEmployeeSummary({ total: 0, active: 0, inactive: 0, mobileActive: 0 });
        setPreviewSummary(
          (json.summary as AttendanceSummary) || {
            total: rows.length,
            present: 0,
            late: 0,
            halfDay: 0,
            absent: 0,
            latePenaltyDays: 0,
          }
        );
      } else if (selectedReport === "late_penalty") {
        const rows = Array.isArray(json.rows) ? (json.rows as LatePenaltyPreviewRow[]) : [];
        setLatePenaltyPreviewRows(rows);
        setPreviewRows([]);
        setLeavePreviewRows([]);
        setClaimPreviewRows([]);
        setCorrectionPreviewRows([]);
        setEmployeePreviewRows([]);
        setPreviewSummary({ total: 0, present: 0, late: 0, halfDay: 0, absent: 0, latePenaltyDays: 0 });
        setLeaveSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAvailableBalance: 0 });
        setClaimSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 });
        setCorrectionSummary({ total: 0, pending: 0, approved: 0, rejected: 0 });
        setEmployeeSummary({ total: 0, active: 0, inactive: 0, mobileActive: 0 });
        setLatePenaltySummary(
          (json.summary as LatePenaltySummary) || {
            total: rows.length,
            totalLateMarks: 0,
            totalLateUpTo: 0,
            totalLateAbove: 0,
            totalPenaltyDays: 0,
          }
        );
      } else if (selectedReport === "leaves") {
        const rows = Array.isArray(json.rows) ? (json.rows as LeavePreviewRow[]) : [];
        setLeavePreviewRows(rows);
        setPreviewRows([]);
        setLatePenaltyPreviewRows([]);
        setClaimPreviewRows([]);
        setCorrectionPreviewRows([]);
        setEmployeePreviewRows([]);
        setPreviewSummary({ total: 0, present: 0, late: 0, halfDay: 0, absent: 0, latePenaltyDays: 0 });
        setLatePenaltySummary({ total: 0, totalLateMarks: 0, totalLateUpTo: 0, totalLateAbove: 0, totalPenaltyDays: 0 });
        setClaimSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 });
        setCorrectionSummary({ total: 0, pending: 0, approved: 0, rejected: 0 });
        setEmployeeSummary({ total: 0, active: 0, inactive: 0, mobileActive: 0 });
        setLeaveSummary(
          (json.summary as LeaveSummary) || {
            total: rows.length,
            pending: 0,
            approved: 0,
            rejected: 0,
            totalAvailableBalance: 0,
          }
        );
      } else if (selectedReport === "claims") {
        const rows = Array.isArray(json.rows) ? (json.rows as ClaimPreviewRow[]) : [];
        setClaimPreviewRows(rows);
        setPreviewRows([]);
        setLatePenaltyPreviewRows([]);
        setLeavePreviewRows([]);
        setCorrectionPreviewRows([]);
        setEmployeePreviewRows([]);
        setPreviewSummary({ total: 0, present: 0, late: 0, halfDay: 0, absent: 0, latePenaltyDays: 0 });
        setLatePenaltySummary({ total: 0, totalLateMarks: 0, totalLateUpTo: 0, totalLateAbove: 0, totalPenaltyDays: 0 });
        setLeaveSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAvailableBalance: 0 });
        setCorrectionSummary({ total: 0, pending: 0, approved: 0, rejected: 0 });
        setEmployeeSummary({ total: 0, active: 0, inactive: 0, mobileActive: 0 });
        setClaimSummary(
          (json.summary as ClaimSummary) || {
            total: rows.length,
            pending: 0,
            approved: 0,
            rejected: 0,
            totalAmount: 0,
          }
        );
      } else if (selectedReport === "corrections") {
        const rows = Array.isArray(json.rows) ? (json.rows as CorrectionPreviewRow[]) : [];
        setCorrectionPreviewRows(rows);
        setPreviewRows([]);
        setLatePenaltyPreviewRows([]);
        setLeavePreviewRows([]);
        setClaimPreviewRows([]);
        setEmployeePreviewRows([]);
        setPreviewSummary({ total: 0, present: 0, late: 0, halfDay: 0, absent: 0, latePenaltyDays: 0 });
        setLatePenaltySummary({ total: 0, totalLateMarks: 0, totalLateUpTo: 0, totalLateAbove: 0, totalPenaltyDays: 0 });
        setLeaveSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAvailableBalance: 0 });
        setClaimSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 });
        setEmployeeSummary({ total: 0, active: 0, inactive: 0, mobileActive: 0 });
        setCorrectionSummary(
          (json.summary as CorrectionSummary) || {
            total: rows.length,
            pending: 0,
            approved: 0,
            rejected: 0,
          }
        );
      } else {
        const rows = Array.isArray(json.rows) ? (json.rows as EmployeePreviewRow[]) : [];
        setEmployeePreviewRows(rows);
        setPreviewRows([]);
        setLatePenaltyPreviewRows([]);
        setLeavePreviewRows([]);
        setClaimPreviewRows([]);
        setCorrectionPreviewRows([]);
        setPreviewSummary({ total: 0, present: 0, late: 0, halfDay: 0, absent: 0, latePenaltyDays: 0 });
        setLatePenaltySummary({ total: 0, totalLateMarks: 0, totalLateUpTo: 0, totalLateAbove: 0, totalPenaltyDays: 0 });
        setLeaveSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAvailableBalance: 0 });
        setClaimSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 });
        setCorrectionSummary({ total: 0, pending: 0, approved: 0, rejected: 0 });
        setEmployeeSummary(
          (json.summary as EmployeeSummary) || {
            total: rows.length,
            active: 0,
            inactive: 0,
            mobileActive: 0,
          }
        );
      }
    } catch (error) {
      setPreviewRows([]);
      setLatePenaltyPreviewRows([]);
      setLeavePreviewRows([]);
      setClaimPreviewRows([]);
      setCorrectionPreviewRows([]);
      setEmployeePreviewRows([]);
      setPreviewSummary({ total: 0, present: 0, late: 0, halfDay: 0, absent: 0, latePenaltyDays: 0 });
      setLatePenaltySummary({ total: 0, totalLateMarks: 0, totalLateUpTo: 0, totalLateAbove: 0, totalPenaltyDays: 0 });
      setLeaveSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAvailableBalance: 0 });
      setClaimSummary({ total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 });
      setCorrectionSummary({ total: 0, pending: 0, approved: 0, rejected: 0 });
      setEmployeeSummary({ total: 0, active: 0, inactive: 0, mobileActive: 0 });
      setPreviewError(error instanceof Error ? error.message : "Unable to load attendance preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleExport() {
    if (
      selectedReport !== "attendance"
      && selectedReport !== "late_penalty"
      && selectedReport !== "leaves"
      && selectedReport !== "claims"
      && selectedReport !== "corrections"
      && selectedReport !== "employees"
    ) {
      setPreviewError("Export is currently enabled only for Attendance, Late Penalty, Leave, Claims, Corrections, and Employee Master reports.");
      return;
    }

    setExporting(true);
    setPreviewError(null);

    try {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token || "";
      const companyId = readStoredCompanyId();

      if (!accessToken) {
        throw new Error("Company session not found. Please login again.");
      }

      const endpoint =
        selectedReport === "attendance"
          ? "/api/company/reports/attendance/export"
          : selectedReport === "late_penalty"
            ? "/api/company/reports/late-penalty/export"
          : selectedReport === "leaves"
            ? "/api/company/reports/leaves/export"
            : selectedReport === "claims"
              ? "/api/company/reports/claims/export"
              : selectedReport === "corrections"
                ? "/api/company/reports/corrections/export"
                : "/api/company/reports/employees/export";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(companyId ? { "x-company-id": companyId } : {}),
        },
        body: JSON.stringify({
          mode: dateMode,
          monthKey,
          startDate,
          endDate,
          employeeQuery,
          department,
          status,
          timeZone: INDIA_TIME_ZONE,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Unable to export report CSV.");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `${selectedReport}-report.csv`;
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Unable to export report CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Reports</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Generate operational and HR reports with live preview and CSV export.
        </p>
      </div>
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Report Type</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{selected.title}</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">{selected.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Scope</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{scopeLabel}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Format</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">CSV export</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{currentPreviewCount > 0 ? `${currentPreviewCount} rows ready` : "Ready"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Export</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{exportReady ? "Available" : "Preview first"}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {reports.map((report) => {
              const active = report.key === selectedReport;
              return (
                <button
                  key={report.key}
                  type="button"
                  onClick={() => setSelectedReport(report.key)}
                  className={[
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {report.title}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {selected.includes.map((item) => (
              <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                {item}
              </span>
            ))}
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4 p-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selection Mode</span>
                    <select
                      value={dateMode}
                      onChange={(e) => setDateMode(e.target.value as DateMode)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="date_range">Date Range</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Month</span>
                    <select
                      value={monthKey}
                      onChange={(e) => setMonthKey(e.target.value)}
                      disabled={dateMode !== "monthly"}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none disabled:opacity-50"
                    >
                      {monthOptions.map((month) => (
                        <option key={month.key} value={month.key}>
                          {month.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Employee Search</span>
                    <input
                      value={employeeQuery}
                      onChange={(e) => setEmployeeQuery(e.target.value)}
                      placeholder="Employee name / code"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From Date</span>
                    <input
                      type="date"
                      value={startDate}
                      min={firstAvailableDate}
                      max={yesterdayISO}
                      disabled={dateMode !== "date_range"}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none disabled:opacity-50"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To Date</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      max={yesterdayISO}
                      disabled={dateMode !== "date_range"}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none disabled:opacity-50"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Department</span>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none"
                    >
                      <option value="all">All Departments</option>
                      <option value="operations">Operations</option>
                      <option value="hr">HR</option>
                      <option value="sales">Sales</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status Filter</span>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value={selectedReport === "attendance" ? "present" : selectedReport === "late_penalty" ? "with_penalty" : selectedReport === "employees" ? "active" : "pending"}>
                        {selectedReport === "attendance" ? "Present" : selectedReport === "late_penalty" ? "With Penalty" : selectedReport === "employees" ? "Active" : "Pending"}
                      </option>
                      <option value={selectedReport === "attendance" ? "late" : selectedReport === "late_penalty" ? "late_only" : selectedReport === "employees" ? "inactive" : "approved"}>
                        {selectedReport === "attendance" ? "Late" : selectedReport === "late_penalty" ? "Late Only" : selectedReport === "employees" ? "Inactive" : "Approved"}
                      </option>
                      {selectedReport === "attendance" && <option value="half_day">Half Day</option>}
                      {selectedReport !== "employees" && (
                        <option value={selectedReport === "attendance" ? "absent" : selectedReport === "late_penalty" ? "no_penalty" : "rejected"}>
                          {selectedReport === "attendance" ? "Absent" : selectedReport === "late_penalty" ? "No Penalty" : "Rejected"}
                        </option>
                      )}
                    </select>
                  </label>

                  <div className="flex items-end gap-3">
                    <button
                      type="button"
                      onClick={handleGeneratePreview}
                      className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
                    >
                      {previewLoading ? "Loading..." : "Generate Preview"}
                    </button>
                    <button
                      type="button"
                      onClick={handleExport}
                      disabled={exporting || previewLoading || !exportReady}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {exporting ? "Exporting..." : "Export CSV"}
                    </button>
                  </div>
                </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedReport === "attendance"
                      ? "Attendance preview with presence, lateness, and work hours."
                      : selectedReport === "leaves"
                        ? "Leave preview with requests, balances, and approval status."
                        : selectedReport === "claims"
                          ? "Claims preview with submitted amounts and approval status."
                          : selectedReport === "corrections"
                            ? "Corrections preview with requested punches and review remarks."
                            : "Employee master preview with status, joining date, and app readiness."}
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {previewLoading ? "Loading..." : `${currentPreviewCount} rows`}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white bg-white px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selected Report</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{selected.title}</div>
                </div>
                <div className="rounded-xl border border-white bg-white px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filter Scope</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{scopeLabel}</div>
                </div>
                <div className="rounded-xl border border-white bg-white px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Export</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{exportReady ? "Preview + export ready" : "Generate preview first"}</div>
                </div>
              </div>

              {selectedReport === "attendance" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-6">
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{previewSummary.total}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Present</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-700">{previewSummary.present}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Late</div>
                        <div className="mt-1 text-lg font-semibold text-amber-700">{previewSummary.late}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Half Day</div>
                        <div className="mt-1 text-lg font-semibold text-sky-700">{previewSummary.halfDay}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Absent</div>
                        <div className="mt-1 text-lg font-semibold text-rose-700">{previewSummary.absent}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Late Penalty</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{previewSummary.latePenaltyDays}</div>
                      </div>
                    </div>
                  ) : selectedReport === "late_penalty" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-5">
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Employees</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{latePenaltySummary.total}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Late Marks</div>
                        <div className="mt-1 text-lg font-semibold text-amber-700">{latePenaltySummary.totalLateMarks}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Late Up To</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{latePenaltySummary.totalLateUpTo}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Late Above</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{latePenaltySummary.totalLateAbove}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Penalty Days</div>
                        <div className="mt-1 text-lg font-semibold text-rose-700">{latePenaltySummary.totalPenaltyDays}</div>
                      </div>
                    </div>
                  ) : selectedReport === "leaves" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-5">
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{leaveSummary.total}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending</div>
                        <div className="mt-1 text-lg font-semibold text-amber-700">{leaveSummary.pending}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Approved</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-700">{leaveSummary.approved}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rejected</div>
                        <div className="mt-1 text-lg font-semibold text-rose-700">{leaveSummary.rejected}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Avail. Balance</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{leaveSummary.totalAvailableBalance}</div>
                      </div>
                    </div>
                  ) : selectedReport === "claims" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-5">
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{claimSummary.total}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending</div>
                        <div className="mt-1 text-lg font-semibold text-amber-700">{claimSummary.pending}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Approved</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-700">{claimSummary.approved}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rejected</div>
                        <div className="mt-1 text-lg font-semibold text-rose-700">{claimSummary.rejected}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Amount</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">INR {claimSummary.totalAmount.toFixed(2)}</div>
                      </div>
                    </div>
                  ) : selectedReport === "corrections" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{correctionSummary.total}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending</div>
                        <div className="mt-1 text-lg font-semibold text-amber-700">{correctionSummary.pending}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Approved</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-700">{correctionSummary.approved}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rejected</div>
                        <div className="mt-1 text-lg font-semibold text-rose-700">{correctionSummary.rejected}</div>
                      </div>
                    </div>
              ) : selectedReport === "employees" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{employeeSummary.total}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-700">{employeeSummary.active}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Inactive</div>
                        <div className="mt-1 text-lg font-semibold text-rose-700">{employeeSummary.inactive}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mobile Active</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{employeeSummary.mobileActive}</div>
                      </div>
                    </div>
              ) : null}

              {previewError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {previewError}
                </div>
              )}

              {selectedReport === "attendance" ? (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-[900px] w-full text-left text-sm">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-3 font-semibold">Employee</th>
                            <th className="px-3 py-3 font-semibold">Department</th>
                            <th className="px-3 py-3 font-semibold">Shift</th>
                            <th className="px-3 py-3 font-semibold">Date</th>
                            <th className="px-3 py-3 font-semibold">Check In</th>
                            <th className="px-3 py-3 font-semibold">Check Out</th>
                            <th className="px-3 py-3 font-semibold">Work Hours</th>
                            <th className="px-3 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!previewLoading && previewRows.length === 0 && !previewError && (
                            <tr>
                              <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                                Generate preview to load attendance report rows.
                              </td>
                            </tr>
                          )}
                          {previewRows.map((row) => (
                            <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                              <td className="px-3 py-3 font-semibold text-slate-900">{row.employee}</td>
                              <td className="px-3 py-3">{row.department}</td>
                              <td className="px-3 py-3">{row.shift}</td>
                              <td className="px-3 py-3">{row.date}</td>
                              <td className="px-3 py-3">{row.checkIn}</td>
                              <td className="px-3 py-3">{row.checkOut}</td>
                              <td className="px-3 py-3 font-semibold text-slate-900">{row.workHours}</td>
                              <td className="px-3 py-3">
                                <span
                                  className={[
                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize",
                                    attendanceStatusChip(row.status),
                                  ].join(" ")}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : selectedReport === "late_penalty" ? (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-[1080px] w-full text-left text-sm">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-3 font-semibold">Employee</th>
                            <th className="px-3 py-3 font-semibold">Department</th>
                            <th className="px-3 py-3 font-semibold">Shift</th>
                            <th className="px-3 py-3 font-semibold">Late Count</th>
                            <th className="px-3 py-3 font-semibold">Late Up To</th>
                            <th className="px-3 py-3 font-semibold">Late Above</th>
                            <th className="px-3 py-3 font-semibold">Penalty Days</th>
                            <th className="px-3 py-3 font-semibold">Rule Applied</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!previewLoading && latePenaltyPreviewRows.length === 0 && !previewError && (
                            <tr>
                              <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                                Generate preview to load late penalty report rows.
                              </td>
                            </tr>
                          )}
                          {latePenaltyPreviewRows.map((row) => (
                            <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                              <td className="px-3 py-3">
                                <div className="font-semibold text-slate-900">{row.employee}</div>
                                <div className="text-xs text-slate-500">{row.employeeCode}</div>
                              </td>
                              <td className="px-3 py-3">{row.department}</td>
                              <td className="px-3 py-3">{row.shift}</td>
                              <td className="px-3 py-3 font-semibold text-slate-900">{row.lateCount}</td>
                              <td className="px-3 py-3">{row.lateUpToCount}</td>
                              <td className="px-3 py-3">{row.lateAboveCount}</td>
                              <td className="px-3 py-3 font-semibold text-rose-700">{row.penaltyDays}</td>
                              <td className="px-3 py-3">
                                <div className="max-w-[300px]">{row.ruleApplied}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : selectedReport === "leaves" ? (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-[1120px] w-full text-left text-sm">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-3 font-semibold">Employee</th>
                            <th className="px-3 py-3 font-semibold">Department</th>
                            <th className="px-3 py-3 font-semibold">Leave Type</th>
                            <th className="px-3 py-3 font-semibold">From</th>
                            <th className="px-3 py-3 font-semibold">To</th>
                            <th className="px-3 py-3 font-semibold">Days</th>
                            <th className="px-3 py-3 font-semibold">Avail. Balance</th>
                            <th className="px-3 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!previewLoading && leavePreviewRows.length === 0 && !previewError && (
                            <tr>
                              <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                                Generate preview to load leave report rows.
                              </td>
                            </tr>
                          )}
                          {leavePreviewRows.map((row) => (
                            <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                              <td className="px-3 py-3">
                                <div className="font-semibold text-slate-900">{row.employee}</div>
                                <div className="text-xs text-slate-500">{row.employeeCode}</div>
                              </td>
                              <td className="px-3 py-3">{row.department}</td>
                              <td className="px-3 py-3">{row.leaveType}</td>
                              <td className="px-3 py-3">{formatDisplayDate(row.fromDate)}</td>
                              <td className="px-3 py-3">{formatDisplayDate(row.toDate)}</td>
                              <td className="px-3 py-3">
                                <div className="font-semibold text-slate-900">{row.days}</div>
                                <div className="text-xs text-slate-500">
                                  Paid {row.paidDays} | Unpaid {row.unpaidDays}
                                </div>
                              </td>
                              <td className="px-3 py-3 font-semibold text-slate-900">{row.availableBalance}</td>
                              <td className="px-3 py-3">
                                <span
                                  className={[
                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize",
                                    leaveStatusChip(row.status),
                                  ].join(" ")}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : selectedReport === "claims" ? (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-[1180px] w-full text-left text-sm">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-3 font-semibold">Employee</th>
                            <th className="px-3 py-3 font-semibold">Department</th>
                            <th className="px-3 py-3 font-semibold">Period</th>
                            <th className="px-3 py-3 font-semibold">Claim Type</th>
                            <th className="px-3 py-3 font-semibold">Amount</th>
                            <th className="px-3 py-3 font-semibold">Reason</th>
                            <th className="px-3 py-3 font-semibold">Attachment</th>
                            <th className="px-3 py-3 font-semibold">Submitted</th>
                            <th className="px-3 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!previewLoading && claimPreviewRows.length === 0 && !previewError && (
                            <tr>
                              <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                                Generate preview to load claims report rows.
                              </td>
                            </tr>
                          )}
                          {claimPreviewRows.map((row) => (
                            <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                              <td className="px-3 py-3">
                                <div className="font-semibold text-slate-900">{row.employee}</div>
                                <div className="text-xs text-slate-500">{row.employeeCode}</div>
                              </td>
                              <td className="px-3 py-3">{row.department}</td>
                              <td className="px-3 py-3">
                                {formatDisplayDate(row.fromDate)} to {formatDisplayDate(row.toDate)}
                                <div className="text-xs text-slate-500">{row.days} day(s)</div>
                              </td>
                              <td className="px-3 py-3">{row.claimType}</td>
                              <td className="px-3 py-3 font-semibold text-slate-900">INR {row.amount.toFixed(2)}</td>
                              <td className="px-3 py-3">
                                <div className="max-w-[260px] truncate" title={row.reason}>
                                  {row.reason || "-"}
                                </div>
                              </td>
                              <td className="px-3 py-3">{row.attachment ? "Attached" : "No attachment"}</td>
                              <td className="px-3 py-3">{formatDisplayDate(row.submittedAt)}</td>
                              <td className="px-3 py-3">
                                <span
                                  className={[
                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize",
                                    leaveStatusChip(row.status),
                                  ].join(" ")}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : selectedReport === "corrections" ? (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-[1120px] w-full text-left text-sm">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-3 font-semibold">Employee</th>
                            <th className="px-3 py-3 font-semibold">Date</th>
                            <th className="px-3 py-3 font-semibold">Requested In</th>
                            <th className="px-3 py-3 font-semibold">Requested Out</th>
                            <th className="px-3 py-3 font-semibold">Reason</th>
                            <th className="px-3 py-3 font-semibold">Submitted</th>
                            <th className="px-3 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!previewLoading && correctionPreviewRows.length === 0 && !previewError && (
                            <tr>
                              <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                                Generate preview to load corrections report rows.
                              </td>
                            </tr>
                          )}
                          {correctionPreviewRows.map((row) => (
                            <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                              <td className="px-3 py-3">
                                <div className="font-semibold text-slate-900">{row.employee}</div>
                                <div className="text-xs text-slate-500">{row.employeeCode}</div>
                              </td>
                              <td className="px-3 py-3">{row.correctionDate}</td>
                              <td className="px-3 py-3">{row.requestedIn}</td>
                              <td className="px-3 py-3">{row.requestedOut}</td>
                              <td className="px-3 py-3">
                                <div className="max-w-[280px]">
                                  <div>{row.reason || "-"}</div>
                                  {row.adminRemark && <div className="mt-1 text-xs text-slate-500">Remark: {row.adminRemark}</div>}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="font-medium text-slate-900">{row.submittedDate}</div>
                                <div className="text-xs text-slate-500">{row.submittedTime}</div>
                              </td>
                              <td className="px-3 py-3">
                                <span
                                  className={[
                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize",
                                    leaveStatusChip(row.status),
                                  ].join(" ")}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : selectedReport === "employees" ? (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-[1240px] w-full text-left text-sm">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-3 font-semibold">Employee</th>
                            <th className="px-3 py-3 font-semibold">Department</th>
                            <th className="px-3 py-3 font-semibold">Designation</th>
                            <th className="px-3 py-3 font-semibold">Shift</th>
                            <th className="px-3 py-3 font-semibold">Mobile</th>
                            <th className="px-3 py-3 font-semibold">Joined</th>
                            <th className="px-3 py-3 font-semibold">Attendance Mode</th>
                            <th className="px-3 py-3 font-semibold">App Status</th>
                            <th className="px-3 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!previewLoading && employeePreviewRows.length === 0 && !previewError && (
                            <tr>
                              <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                                Generate preview to load employee master rows.
                              </td>
                            </tr>
                          )}
                          {employeePreviewRows.map((row) => (
                            <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                              <td className="px-3 py-3">
                                <div className="font-semibold text-slate-900">{row.employee}</div>
                                <div className="text-xs text-slate-500">{row.employeeCode}</div>
                              </td>
                              <td className="px-3 py-3">{row.department}</td>
                              <td className="px-3 py-3">{row.designation}</td>
                              <td className="px-3 py-3">{row.shift}</td>
                              <td className="px-3 py-3">{row.mobile || "-"}</td>
                              <td className="px-3 py-3">{formatDisplayDate(row.joinedOn)}</td>
                              <td className="px-3 py-3">{row.attendanceMode}</td>
                              <td className="px-3 py-3">{row.mobileAppStatus}</td>
                              <td className="px-3 py-3">
                                <span
                                  className={[
                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize",
                                    row.status === "active"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-rose-200 bg-rose-50 text-rose-700",
                                  ].join(" ")}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                      Live preview is not connected yet for this report module.
                    </div>
                  )}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
