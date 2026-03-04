"use client";

import Image from "next/image";
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
  const [savedLogo, setSavedLogo] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [officeLat, setOfficeLat] = useState("");
  const [officeLon, setOfficeLon] = useState("");
  const [officeRadiusM, setOfficeRadiusM] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  }

  useEffect(() => {
    let ignore = false;
    async function loadAttendanceSettings() {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) return;

      const response = await fetch("/api/company/settings", {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      const result = (await response.json().catch(() => ({}))) as {
        office_lat?: number | null;
        office_lon?: number | null;
        office_radius_m?: number | null;
        company_logo_url?: string | null;
      };
      if (!response.ok || ignore) return;
      setOfficeLat(result.office_lat == null ? "" : String(result.office_lat));
      setOfficeLon(result.office_lon == null ? "" : String(result.office_lon));
      setOfficeRadiusM(result.office_radius_m == null ? "" : String(result.office_radius_m));
      setSavedLogo(result.company_logo_url || null);
      setLogoPreview(result.company_logo_url || null);

      try {
        const raw = localStorage.getItem("phv_company");
        if (raw) {
          const company = JSON.parse(raw);
          localStorage.setItem(
            "phv_company",
            JSON.stringify({
              ...company,
              company_logo_url: result.company_logo_url || null,
            })
          );
        }
      } catch {
        // Ignore localStorage parse failures.
      }
    }
    loadAttendanceSettings();
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
      // Ignore localStorage parse failures.
    }

    showToast("Password changed successfully.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    if (forcePassword) {
      window.setTimeout(() => router.replace("/company/dashboard"), 500);
    }
  }

  function handleLogoChange(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      return showToast("Please select an image file.");
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(typeof reader.result === "string" ? reader.result : null);
      showToast("Logo selected. Click Save Logo to apply.");
    };
    reader.readAsDataURL(file);
  }

  function handleSaveLogo() {
    void (async () => {
      if (!logoPreview) return showToast("Please select a logo first.");

      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) return showToast("Company session not found. Please login again.");

      setSavingLogo(true);
      const response = await fetch("/api/company/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          company_logo_url: logoPreview,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setSavingLogo(false);
      if (!response.ok || !result.ok) {
        return showToast(result.error || "Unable to save logo.");
      }

      setSavedLogo(logoPreview);
      try {
        const raw = localStorage.getItem("phv_company");
        if (raw) {
          const company = JSON.parse(raw);
          localStorage.setItem(
            "phv_company",
            JSON.stringify({
              ...company,
              company_logo_url: logoPreview,
            })
          );
        }
      } catch {
        // Ignore localStorage parse failures.
      }
      showToast("Company logo saved.");
    })();
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

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-5 text-white">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-sky-100">COMPANY ADMIN</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-sky-100">Manage security preferences and account behavior.</p>
        </div>
      </section>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{toast}</div>
      )}
      {forcePassword && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          First login detected. Please change your password to continue.
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-sm text-slate-700">Current Password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm text-slate-700">New Password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm text-slate-700">Confirm Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleChangePassword}
          className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Update Password
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Office Attendance Location</h2>
        <p className="mt-1 text-sm text-slate-600">
          Used for employees marked as Office Only. Leave all fields blank if you are not using office-radius attendance yet.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-sm text-slate-700">Office Latitude</span>
            <input
              value={officeLat}
              onChange={(e) => setOfficeLat(e.target.value)}
              placeholder="18.520430"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm text-slate-700">Office Longitude</span>
            <input
              value={officeLon}
              onChange={(e) => setOfficeLon(e.target.value)}
              placeholder="73.856743"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm text-slate-700">Allowed Radius (meters)</span>
            <input
              value={officeRadiusM}
              onChange={(e) => setOfficeRadiusM(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="150"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleSaveAttendanceSettings}
          disabled={savingAttendance}
          className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {savingAttendance ? "Saving..." : "Save Office Attendance Settings"}
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Company Logo</h2>
        <p className="mt-1 text-sm text-slate-600">Upload your company logo to use across the portal.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogoChange(e.target.files?.[0] || null)}
            />
            {savedLogo ? "Change Company Logo" : "Add Company Logo"}
          </label>
          <button
            type="button"
            onClick={handleSaveLogo}
            disabled={savingLogo || !logoPreview || logoPreview === savedLogo}
            className={[
              "rounded-lg px-3 py-2 text-sm font-semibold",
              savingLogo || !logoPreview || logoPreview === savedLogo
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
            ].join(" ")}
          >
            {savingLogo ? "Saving..." : "Save Logo"}
          </button>
          {logoPreview && (
            <Image
              src={logoPreview}
              alt="Company logo preview"
              width={56}
              height={56}
              className="h-14 w-14 rounded-lg border border-slate-200 object-contain bg-white p-1"
            />
          )}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-rose-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-rose-700">Security Actions</h2>
        <p className="mt-1 text-sm text-slate-600">Use this if account access is suspected on another device.</p>
        <button
          type="button"
          onClick={() => showToast("All other sessions logged out (UI only).")}
          className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          Logout from all other sessions
        </button>
      </section>
    </div>
  );
}

export default function CompanySettingsPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0" />}
    >
      <CompanySettingsPageContent />
    </Suspense>
  );
}
