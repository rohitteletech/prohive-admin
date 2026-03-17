"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const TARGET_PATH = "/company/settings/policies/holiday-weekly-off-policy";

export default function ManageHolidaysPage() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => {
      router.replace(TARGET_PATH);
    }, 250);

    return () => window.clearTimeout(id);
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-2">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Holiday Settings Moved</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Holiday and weekly off setup आता policy-based page वर shift केले आहे, त्यामुळे single source of truth
          राहील.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          तुम्हाला लगेच नवीन page वर redirect केले जाईल.
        </p>
        <div className="mt-5">
          <Link
            href={TARGET_PATH}
            className="inline-flex rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700"
          >
            Open Holiday / Weekly Off Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
