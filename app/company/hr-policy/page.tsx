"use client";

const policySections = [
  {
    title: "Working Hours",
    points: [
      "Standard office timings are 9:30 AM to 6:30 PM, Monday to Saturday.",
      "Employees are expected to mark attendance accurately through the assigned system.",
      "Repeated late arrivals may trigger manager review and corrective action.",
    ],
  },
  {
    title: "Leave and Time Off",
    points: [
      "All leave requests must be submitted in advance through the leave module.",
      "Emergency leave should be informed to the reporting manager as early as possible.",
      "Unapproved absence may be treated as leave without pay depending on policy review.",
    ],
  },
  {
    title: "Code of Conduct",
    points: [
      "Employees must maintain respectful behavior with colleagues, clients, and partners.",
      "Company systems and data should be used only for authorized work purposes.",
      "Any policy violation or misconduct may lead to disciplinary action.",
    ],
  },
];

export default function CompanyHrPolicyPage() {
  return (
    <div className="mx-auto max-w-5xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Company Handbook
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">HR Policy</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Central reference for basic workplace expectations, attendance discipline, leave practice, and conduct standards.
          </p>
        </div>

        <div className="mt-8 grid gap-4">
          {policySections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {section.points.map((point) => (
                  <li key={point} className="flex gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-sky-500" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Final interpretation of policy remains with company management. Update this page whenever internal policy changes.
        </div>
      </div>
    </div>
  );
}
