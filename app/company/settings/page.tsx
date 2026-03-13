"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase/client";

function CompanySettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forcePassword = searchParams.get("forcePassword") === "1";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savedTagline, setSavedTagline] = useState("");
  const [taglineInput, setTaglineInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [officeLat, setOfficeLat] = useState("");
  const [officeLon, setOfficeLon] = useState("");
  const [officeRadiusM, setOfficeRadiusM] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [savingTagline, setSavingTagline] = useState(false);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  }

  useEffect(() => {
    let ignore = false;
    async function loadSettings() {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) return;

      const response = await fetch("/api/company/settings", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json().catch(() => ({}))) as {
        office_lat?: number | null;
        office_lon?: number | null;
        office_radius_m?: number | null;
        company_tagline?: string | null;
      };
      if (!response.ok || ignore) return;
      setOfficeLat(result.office_lat == null ? "" : String(result.office_lat));
      setOfficeLon(result.office_lon == null ? "" : String(result.office_lon));
      setOfficeRadiusM(result.office_radius_m == null ? "" : String(result.office_radius_m));
      setSavedTagline(result.company_tagline || "");
      setTaglineInput(result.company_tagline || "");

      try {
        const raw = localStorage.getItem("phv_company");
        if (raw) {
          const company = JSON.parse(raw);
          localStorage.setItem("phv_company", JSON.stringify({ ...company, company_tagline: result.company_tagline || "" }));
        }
      } catch {
      }
    }
    void loadSettings();
    return () => {
      ignore = true;
    };
  }, []);

  async function handleChangePassword() {
    if (!currentPassword.trim()) return showToast("Current password is required.");
    if (!newPassword.trim()) return showToast("New password is required.");
    if (newPassword.length < 8) return showToast("New password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return showToast("New password and confirm password must match.");

    if (!hasSupabaseEnv()) {
      showToast("Supabase is not configured.");
      return;
    }

    const supabase = getSupabaseBrowserClient("company");
    if (!supabase) {
      showToast("Supabase client unavailable.");
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const email = authData.user?.email;
    if (authError || !email) {
      showToast("Session expired. Please login again.");
      return;
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword.trim(),
    });
    if (reauthError) {
      showToast("Current password is incorrect.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
    if (updateError) {
      showToast(updateError.message);
      return;
    }

    try {
      const raw = localStorage.getItem("phv_company_session");
      if (raw) {
        const session = JSON.parse(raw);
        localStorage.setItem("phv_company_session", JSON.stringify({ ...session, must_change_password: false }));
      }
    } catch {
    }

    showToast("Password changed successfully.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    if (forcePassword) {
      window.setTimeout(() => router.replace("/company/dashboard"), 500);
    }
  }

  async function handleSaveAttendanceSettings() {
    const hasAny = officeLat.trim() || officeLon.trim() || officeRadiusM.trim();
    if (hasAny && (!officeLat.trim() || !officeLon.trim() || !officeRadiusM.trim())) {
      return showToast("Latitude, longitude, and radius are all required.");
    }

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) {
      return showToast("Company session not found. Please login again.");
    }

    setSavingAttendance(true);
    const response = await fetch("/api/company/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        office_lat: officeLat.trim() ? Number(officeLat) : null,
        office_lon: officeLon.trim() ? Number(officeLon) : null,
        office_radius_m: officeRadiusM.trim() ? Number(officeRadiusM) : null,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSavingAttendance(false);
    if (!response.ok || !result.ok) {
      return showToast(result.error || "Unable to save office attendance settings.");
    }
    showToast("Office attendance settings saved.");
  }

  function handleSaveTagline() {
    void (async () => {
      const tagline = taglineInput.trim();
      if (tagline.length > 100) return showToast("Tagline must be 100 characters or less.");

      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) return showToast("Company session not found. Please login again.");

      setSavingTagline(true);
      const response = await fetch("/api/company/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ company_tagline: tagline || null }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setSavingTagline(false);
      if (!response.ok || !result.ok) {
        return showToast(result.error || "Unable to save company tagline.");
      }

      setSavedTagline(tagline);
      try {
        const raw = localStorage.getItem("phv_company");
        if (raw) {
          const company = JSON.parse(raw);
          localStorage.setItem("phv_company", JSON.stringify({ ...company, company_tagline: tagline }));
        }
      } catch {
      }
      showToast("Company tagline saved.");
    })();
  }

  function cardClass(tone: "default" | "danger" = "default") {
    return [
      "rounded-[24px] border bg-white shadow-sm p-5 sm:p-6",
      tone === "danger" ? "border-rose-200" : "border-slate-200",
    ].join(" ");
  }

  return (
    <div className="mx-auto max-w-6xl px-3 pb-6 pt-0 sm:px-4 lg:px-5">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Manage security preferences, office attendance setup, brand identity, and account safety without oversized form sections.</p>
      </div>

      {toast && <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{toast}</div>}
      {forcePassword && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          First login detected. Please change your password to continue.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className={cardClass()}>
            <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
              <p className="text-sm text-slate-600">Update your login password and keep your admin account secure.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-sm text-slate-700">Current Password</span>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-slate-700">New Password</span>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-slate-700">Confirm Password</span>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none" />
              </label>
            </div>
            <button type="button" onClick={handleChangePassword} className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              Update Password
            </button>
          </section>

          <section className={cardClass()}>
            <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">Office Attendance Location</h2>
              <p className="text-sm text-slate-600">Used for employees marked as Office Only. Leave all fields blank if office-radius attendance is not enabled.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-sm text-slate-700">Office Latitude</span>
                <input value={officeLat} onChange={(e) => setOfficeLat(e.target.value)} placeholder="18.520430" className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-slate-700">Office Longitude</span>
                <input value={officeLon} onChange={(e) => setOfficeLon(e.target.value)} placeholder="73.856743" className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none" />
              </label>
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-sm text-slate-700">Allowed Radius (meters)</span>
                <input value={officeRadiusM} onChange={(e) => setOfficeRadiusM(e.target.value.replace(/[^\d]/g, ""))} placeholder="150" className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none sm:max-w-xs" />
              </label>
            </div>
            <button type="button" onClick={handleSaveAttendanceSettings} disabled={savingAttendance} className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
              {savingAttendance ? "Saving..." : "Save Office Attendance Settings"}
            </button>
          </section>
        </div>

        <div className="space-y-4 xl:sticky xl:top-24">
          <section className={cardClass()}>
            <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">Company Tagline</h2>
              <p className="text-sm text-slate-600">Add a short line that employees will see across the app.</p>
            </div>
            <label className="mt-4 grid gap-1.5">
              <span className="text-sm text-slate-700">Tagline (max 100 chars)</span>
              <input value={taglineInput} onChange={(e) => setTaglineInput(e.target.value)} maxLength={100} placeholder="Example: Trusted service, every day." className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none" />
            </label>
            <div className="mt-2 text-xs text-slate-500">{taglineInput.trim().length}/100</div>
            <button
              type="button"
              onClick={handleSaveTagline}
              disabled={savingTagline || taglineInput.trim() === savedTagline}
              className={[
                "mt-4 rounded-lg px-4 py-2.5 text-sm font-semibold",
                savingTagline || taglineInput.trim() === savedTagline
                  ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                  : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
              ].join(" ")}
            >
              {savingTagline ? "Saving..." : "Save Tagline"}
            </button>
          </section>

          <section className={cardClass("danger")}>
            <div className="flex flex-col gap-1 border-b border-rose-100 pb-4">
              <h2 className="text-lg font-semibold text-rose-700">Security Actions</h2>
              <p className="text-sm text-slate-600">Use this if account access is suspected on another device.</p>
            </div>
            <button type="button" onClick={() => showToast("All other sessions logged out (UI only).")} className="mt-4 w-full rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100">
              Logout from all other sessions
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function CompanySettingsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-3 pb-6 pt-0 sm:px-4 lg:px-5" />}>
      <CompanySettingsPageContent />
    </Suspense>
  );
}
