"use client";

import { PolicyLinkCard } from "@/components/company/policy-ui";

const policies = [
  {
    href: "/company/settings/policies/shift-policy",
    title: "Shift Policy",
    description: "Define shift names, timing windows, grace limits, and the base operating schedule for the company.",
  },
  {
    href: "/company/settings/policies/attendance-policy",
    title: "Attendance Policy",
    description: "Define present, half day, absent, late punch, early go, and monthly present-day formulas.",
  },
  {
    href: "/company/settings/policies/leave-policy",
    title: "Leave Policy",
    description: "Configure leave types, balances, carry forward, approval logic, and leave overrides.",
  },
  {
    href: "/company/settings/policies/holiday-weekly-off-policy",
    title: "Holiday / Weekly Off Policy",
    description: "Configure holiday calendars, weekly off patterns, and rules for working on non-working days.",
  },
  {
    href: "/company/settings/policies/correction-regularization-policy",
    title: "Correction / Regularization Policy",
    description: "Define correction windows, missing-punch rules, approval flow, and attendance regularization impact.",
  },
];

export default function CompanyPoliciesHubPage() {
  return (
    <div className="mx-auto max-w-7xl px-2 pb-6 pt-0 sm:px-3 lg:px-4">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
          Policy Hub
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Company Policy Pages</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          This is the new standalone policy section. It does not depend on the older settings pages and keeps the five core policy areas separate and aligned.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {policies.map((policy) => (
            <PolicyLinkCard key={policy.href} {...policy} />
          ))}
        </div>
      </div>
    </div>
  );
}
