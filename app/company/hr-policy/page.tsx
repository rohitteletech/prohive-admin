"use client";

import { useState } from "react";

type PolicySection = {
  id: string;
  title: string;
  points: string[];
};

const initialPolicySections: PolicySection[] = [
  {
    id: "working-hours",
    title: "Working Hours",
    points: [
      "Standard office timings are 9:30 AM to 6:30 PM, Monday to Saturday.",
      "Employees are expected to mark attendance accurately through the assigned system.",
      "Repeated late arrivals may trigger manager review and corrective action.",
    ],
  },
  {
    id: "leave-and-time-off",
    title: "Leave and Time Off",
    points: [
      "All leave requests must be submitted in advance through the leave module.",
      "Emergency leave should be informed to the reporting manager as early as possible.",
      "Unapproved absence may be treated as leave without pay depending on policy review.",
    ],
  },
  {
    id: "code-of-conduct",
    title: "Code of Conduct",
    points: [
      "Employees must maintain respectful behavior with colleagues, clients, and partners.",
      "Company systems and data should be used only for authorized work purposes.",
      "Any policy violation or misconduct may lead to disciplinary action.",
    ],
  },
];

function createEmptySection(index: number): PolicySection {
  return {
    id: `custom-${Date.now()}-${index}`,
    title: `New Section ${index + 1}`,
    points: ["Add policy point"],
  };
}

export default function CompanyHrPolicyPage() {
  const [policySections, setPolicySections] = useState<PolicySection[]>(initialPolicySections);
  const [policyStatus, setPolicyStatus] = useState("Published");
  const [effectiveDate, setEffectiveDate] = useState("2026-03-11");
  const [policyOwner, setPolicyOwner] = useState("HR Department");
  const [version, setVersion] = useState("v1.0");
  const [requireAcknowledgement, setRequireAcknowledgement] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [showOnEmployeeApp, setShowOnEmployeeApp] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  function updateSectionTitle(id: string, title: string) {
    setPolicySections((current) =>
      current.map((section) => (section.id === id ? { ...section, title } : section))
    );
  }

  function updatePoint(sectionId: string, pointIndex: number, value: string) {
    setPolicySections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              points: section.points.map((point, index) => (index === pointIndex ? value : point)),
            }
          : section
      )
    );
  }

  function addSection() {
    setPolicySections((current) => [...current, createEmptySection(current.length)]);
  }

  function removeSection(sectionId: string) {
    setPolicySections((current) => current.filter((section) => section.id !== sectionId));
  }

  function addPoint(sectionId: string) {
    setPolicySections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, points: [...section.points, "New policy point"] } : section
      )
    );
  }

  function removePoint(sectionId: string, pointIndex: number) {
    setPolicySections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              points: section.points.filter((_, index) => index !== pointIndex),
            }
          : section
      )
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.72fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Company Handbook
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">HR Policy</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Manage the policy content employees see, track ownership, and control whether acknowledgement is required.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => showToast("Draft saved locally.")}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => {
                  setPolicyStatus("Published");
                  showToast("Policy marked as published.");
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Publish Policy
              </button>
            </div>
          </div>

          {toast && <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{toast}</div>}

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{policyStatus}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Version</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{version}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Owner</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{policyOwner}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sections</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{policySections.length}</div>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            {policySections.map((section, sectionIndex) => (
              <section key={section.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Section Title</span>
                      <input
                        value={section.title}
                        onChange={(event) => updateSectionTitle(section.id, event.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSection(section.id)}
                    disabled={policySections.length === 1}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Remove Section
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {section.points.map((point, pointIndex) => (
                    <div key={`${section.id}-${pointIndex}`} className="flex gap-3">
                      <span className="mt-3 h-2 w-2 rounded-full bg-sky-500" />
                      <textarea
                        value={point}
                        onChange={(event) => updatePoint(section.id, pointIndex, event.target.value)}
                        rows={2}
                        className="min-h-[72px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removePoint(section.id, pointIndex)}
                        disabled={section.points.length === 1}
                        className="self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => addPoint(section.id)}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    Add Point
                  </button>
                  <span className="text-xs text-slate-500">Section {sectionIndex + 1}</span>
                </div>
              </section>
            ))}
          </div>

          <button
            type="button"
            onClick={addSection}
            className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Add New Section
          </button>
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Policy Controls</h2>
            <p className="mt-1 text-sm text-slate-600">Administrative settings for visibility, review cycle, and ownership.</p>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-sm text-slate-700">Status</span>
                <select
                  value={policyStatus}
                  onChange={(event) => setPolicyStatus(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                >
                  <option>Draft</option>
                  <option>Published</option>
                  <option>Archived</option>
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm text-slate-700">Effective Date</span>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(event) => setEffectiveDate(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm text-slate-700">Policy Owner</span>
                <input
                  value={policyOwner}
                  onChange={(event) => setPolicyOwner(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm text-slate-700">Version</span>
                <input
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Employee Access</h2>
            <div className="mt-4 space-y-3">
              <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Show on employee app</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">If off, only company admins can view this policy page.</div>
                </div>
                <input
                  type="checkbox"
                  checked={showOnEmployeeApp}
                  onChange={(event) => setShowOnEmployeeApp(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
              </label>

              <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Require acknowledgement</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">Enable once employees must confirm they have read the latest policy.</div>
                </div>
                <input
                  type="checkbox"
                  checked={requireAcknowledgement}
                  onChange={(event) => setRequireAcknowledgement(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
              </label>

              <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Allow downloads</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">Use this when a printable PDF or handbook export is available.</div>
                </div>
                <input
                  type="checkbox"
                  checked={allowDownloads}
                  onChange={(event) => setAllowDownloads(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-900">Notes</h2>
            <div className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
              <p>Effective from: {effectiveDate || "-"}</p>
              <p>Acknowledgement: {requireAcknowledgement ? "Required" : "Not required"}</p>
              <p>Employee visibility: {showOnEmployeeApp ? "Visible" : "Admin only"}</p>
              <p>Downloads: {allowDownloads ? "Enabled" : "Disabled"}</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
