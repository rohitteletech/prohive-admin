"use client";

import { useState } from "react";
import {
  PolicyPage,
  PolicyRegisterSection,
} from "@/components/company/policy-ui";

type Mode = "draft" | "published";
type ShiftPolicyState = {
  policyName: string;
  version: string;
  effectiveDate: string;
  defaultShiftName: string;
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: string;
  earlyInMinutes: string;
  minWorkBeforeOutMinutes: string;
  loginAccessRule: "any_time" | "shift_time_only";
  weeklyOffPattern: "sunday_only" | "saturday_sunday" | "alternate_saturday";
  shiftRotation: "fixed" | "rotational";
};

const initialState: ShiftPolicyState = {
  policyName: "Standard Shift Policy",
  version: "v1.0",
  effectiveDate: "2026-03-13",
  defaultShiftName: "General Shift",
  shiftStart: "09:00",
  shiftEnd: "18:00",
  graceMinutes: "10",
  earlyInMinutes: "15",
  minWorkBeforeOutMinutes: "60",
  loginAccessRule: "any_time",
  weeklyOffPattern: "sunday_only",
  shiftRotation: "fixed",
};

export default function NewShiftPolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);

  function update<K extends keyof ShiftPolicyState>(key: K, value: ShiftPolicyState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  return (
    <PolicyPage
      badge="Shift Policy"
      title="Shift Policy"
      description="Maintain company shift policy records with effective governance dates and default applicability."
    >
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}
      <PolicyRegisterSection
        description="Maintain approved shift policy records with effective dates, review checkpoints, ownership, and default company applicability."
        onCreate={() => {
          setDraft(initialState);
          notify("New shift policy draft started.");
        }}
        onEdit={() => notify("Current shift policy opened for editing.")}
        row={{
          name: draft.policyName,
          policyCode: "SFT-001",
          effectiveFrom: draft.effectiveDate,
          reviewDueOn: "2027-03-13",
          status: "Draft",
          createdBy: "Company Admin",
          createdOn: "2026-03-13 08:00 AM",
          defaultPolicy: "Yes",
        }}
      />
    </PolicyPage>
  );
}
