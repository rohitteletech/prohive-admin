"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AsideCard,
  Field,
  InfoTile,
  PolicyActions,
  PolicyPage,
  PolicyRegisterSection,
  PolicySection,
  Select,
  SnapshotRow,
  TextArea,
  TextInput,
} from "@/components/company/policy-ui";

type Mode = "draft" | "published";
type HolidayState = {
  policyName: string;
  version: string;
  effectiveDate: string;
  holidaySource: "company" | "government" | "mixed";
  weeklyOffPattern: "sunday_only" | "saturday_sunday" | "alternate_saturday";
  holidayPunchAllowed: "yes" | "no";
  weeklyOffPunchAllowed: "yes" | "no";
  holidayWorkedStatus: "holiday_worked" | "present" | "ot_only";
  weeklyOffWorkedStatus: "weekly_off_worked" | "present" | "ot_only";
  compOffEnabled: "yes" | "no";
  notes: string;
};

const initialState: HolidayState = {
  policyName: "Standard Holiday Policy",
  version: "v1.0",
  effectiveDate: "2026-03-13",
  holidaySource: "mixed",
  weeklyOffPattern: "sunday_only",
  holidayPunchAllowed: "yes",
  weeklyOffPunchAllowed: "yes",
  holidayWorkedStatus: "holiday_worked",
  weeklyOffWorkedStatus: "weekly_off_worked",
  compOffEnabled: "yes",
  notes: "Holiday and weekly off worked days should be visible separately from normal present days.",
};

export default function NewHolidayPolicyPage() {
  const [mode, setMode] = useState<Mode>("draft");
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);

  function update<K extends keyof HolidayState>(key: K, value: HolidayState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  return (
    <PolicyPage
      badge="Holiday Policy"
      title="Holiday / Weekly Off Policy"
      description="Create a new standalone page for holiday calendars, weekly off patterns, worked-on-holiday rules, and comp-off eligibility."
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              setDraft(initialState);
              setMode("draft");
              notify("New holiday policy draft started.");
            }}
            className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100 xl:min-w-[150px]"
          >
            Create New Policy
          </button>
          <PolicyActions onDraft={() => { setMode("draft"); notify("Holiday policy draft saved locally."); }} onPublish={() => { setMode("published"); notify("Holiday policy marked ready for backend wiring."); }} />
        </>
      }
      aside={
        <>
          <AsideCard title="Policy Snapshot" description="Preview of non-working day rules and worked-day handling.">
            <SnapshotRow label="Holiday Source" value={draft.holidaySource === "company" ? "Company Only" : draft.holidaySource === "government" ? "Government Only" : "Company + Government"} />
            <SnapshotRow label="Weekly Off" value={draft.weeklyOffPattern === "sunday_only" ? "Sunday only" : draft.weeklyOffPattern === "saturday_sunday" ? "Saturday + Sunday" : "Alternate Saturday + Sunday"} />
            <SnapshotRow label="Holiday Worked" value={draft.holidayWorkedStatus === "holiday_worked" ? "Holiday Worked" : draft.holidayWorkedStatus === "present" ? "Present" : "Overtime Only"} />
            <SnapshotRow label="Comp Off" value={draft.compOffEnabled === "yes" ? "Enabled" : "Disabled"} />
          </AsideCard>
          <AsideCard title="Next Policies" description="Holiday rules should align with leave and attendance count formulas.">
            <Link href="/company/settings/policies/correction-regularization-policy" className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Open Correction Policy
            </Link>
          </AsideCard>
        </>
      }
    >
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}
      <PolicyRegisterSection
        description="Maintain holiday and weekly off policy records with review dates, ownership visibility, and default company assignment."
        onCreate={() => {
          setDraft(initialState);
          setMode("draft");
          notify("New holiday policy draft started.");
        }}
        onEdit={() => notify("Current holiday policy opened for editing.")}
        row={{
          name: draft.policyName,
          policyCode: "HOL-001",
          effectiveFrom: draft.effectiveDate,
          reviewDueOn: "2027-03-13",
          status: mode === "published" ? "Active" : "Draft",
          createdBy: "Company Admin",
          createdOn: "2026-03-13 08:15 AM",
          defaultPolicy: "Yes",
        }}
      />
      <div className="grid gap-3 md:grid-cols-4">
        <InfoTile label="Status" value={mode === "published" ? "Published UI" : "Draft UI"} tone="sky" />
        <InfoTile label="Version" value={draft.version} />
        <InfoTile label="Effective Date" value={draft.effectiveDate} />
        <InfoTile label="Comp Off" value={draft.compOffEnabled === "yes" ? "Enabled" : "Disabled"} tone="emerald" />
      </div>

      <PolicySection title="Holiday Calendar Rules" description="Define where holidays come from and how non-working days are structured." tone="slate">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Policy Name"><TextInput value={draft.policyName} onChange={(e) => update("policyName", e.target.value)} /></Field>
          <Field label="Effective Date"><TextInput type="date" value={draft.effectiveDate} onChange={(e) => update("effectiveDate", e.target.value)} /></Field>
          <Field label="Holiday Source">
            <Select value={draft.holidaySource} onChange={(e) => update("holidaySource", e.target.value as HolidayState["holidaySource"])}>
              <option value="company">Company Holidays</option>
              <option value="government">Government Holidays</option>
              <option value="mixed">Company + Government</option>
            </Select>
          </Field>
          <Field label="Weekly Off Pattern">
            <Select value={draft.weeklyOffPattern} onChange={(e) => update("weeklyOffPattern", e.target.value as HolidayState["weeklyOffPattern"])}>
              <option value="sunday_only">Sunday Only</option>
              <option value="saturday_sunday">Saturday + Sunday</option>
              <option value="alternate_saturday">Alternate Saturday + Sunday</option>
            </Select>
          </Field>
        </div>
      </PolicySection>

      <PolicySection title="Worked On Non-Working Day Rules" description="Define what status the system should assign when employees punch on holidays or weekly offs.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Holiday Punch Allowed">
            <Select value={draft.holidayPunchAllowed} onChange={(e) => update("holidayPunchAllowed", e.target.value as HolidayState["holidayPunchAllowed"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Weekly Off Punch Allowed">
            <Select value={draft.weeklyOffPunchAllowed} onChange={(e) => update("weeklyOffPunchAllowed", e.target.value as HolidayState["weeklyOffPunchAllowed"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="If Punched On Holiday">
            <Select value={draft.holidayWorkedStatus} onChange={(e) => update("holidayWorkedStatus", e.target.value as HolidayState["holidayWorkedStatus"])}>
              <option value="holiday_worked">Holiday Worked</option>
              <option value="present">Present</option>
              <option value="ot_only">OT Only</option>
            </Select>
          </Field>
          <Field label="If Punched On Weekly Off">
            <Select value={draft.weeklyOffWorkedStatus} onChange={(e) => update("weeklyOffWorkedStatus", e.target.value as HolidayState["weeklyOffWorkedStatus"])}>
              <option value="weekly_off_worked">Weekly Off Worked</option>
              <option value="present">Present</option>
              <option value="ot_only">OT Only</option>
            </Select>
          </Field>
          <Field label="Comp Off Enabled">
            <Select value={draft.compOffEnabled} onChange={(e) => update("compOffEnabled", e.target.value as HolidayState["compOffEnabled"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Policy Notes">
            <TextArea rows={5} value={draft.notes} onChange={(e) => update("notes", e.target.value)} />
          </Field>
        </div>
      </PolicySection>
    </PolicyPage>
  );
}
