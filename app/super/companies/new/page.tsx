"use client";

import React, { useMemo, useState } from "react";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase/client";
import Link from "next/link";

type PlanType = "trial" | "monthly" | "yearly";

export default function NewCompanyPage() {
  const [form, setForm] = useState({
    companyName: "",
    companyCode: "PHV-000001",
    sizeOfEmployees: "",
    authorizedName: "",
    mobile: "",
    address: "",
    city: "",
    state: "",
    country: "India",
    pinCode: "",
    plan: "trial" as PlanType,
    adminEmail: "",
    adminPassword: "",
    gst: "",
    businessNature: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const planLabel = useMemo(() => {
    if (form.plan === "trial") return "Trial (7 Days)";
    if (form.plan === "monthly") return "Monthly";
    return "Yearly";
  }, [form.plan]);

  const planPreview = useMemo(() => {
    if (form.plan === "trial") return "7 days access";
    if (form.plan === "monthly") return "30 days + 7 grace";
    return "365 days + 7 grace";
  }, [form.plan]);

  const isBlank = (v: string) => !String(v || "").trim();

  const canCreate =
    !isBlank(form.companyName) &&
    !isBlank(form.authorizedName) &&
    !isBlank(form.mobile) &&
    !isBlank(form.address) &&
    !isBlank(form.city) &&
    !isBlank(form.state) &&
    !isBlank(form.country) &&
    !isBlank(form.pinCode) &&
    !isBlank(form.adminEmail) &&
    !isBlank(form.adminPassword);

  async function handleCreateCompany() {
    if (!canCreate || saving) return;
    setMessage(null);
    setSaving(true);

    if (!hasSupabaseEnv()) {
      setSaving(false);
      setMessage("Supabase env is not configured.");
      return;
    }

    const supabase = getSupabaseBrowserClient("super");
    if (!supabase) {
      setSaving(false);
      setMessage("Supabase client unavailable.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setSaving(false);
      setMessage("Superadmin session not found. Please login again.");
      return;
    }

    const res = await fetch("/api/super/companies", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        companyName: form.companyName,
        companyCode: form.companyCode,
        sizeOfEmployees: form.sizeOfEmployees,
        authorizedName: form.authorizedName,
        mobile: form.mobile,
        address: form.address,
        city: form.city,
        state: form.state,
        country: form.country,
        pinCode: form.pinCode,
        plan: form.plan,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        gst: form.gst,
        businessNature: form.businessNature,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(`Create failed: ${err.error || "Unknown error"}`);
      return;
    }

    alert("Company created successfully.");
    window.location.href = "/super/companies";
  }

  return (
    <div style={pageWrap}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Create New Company</h1>
      <p style={{ marginTop: 4, color: "#555", fontSize: 14 }}>Fill the details below. Fields marked * are mandatory.</p>

      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Company Basics</h2>
        <div style={grid2}>
          <label style={labelStyle}>
            <span>Company Name *</span>
            <input
              placeholder="e.g. Prohive Solutions"
              style={inputStyle}
              autoComplete="off"
              value={form.companyName}
              onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
            />
          </label>

          <label style={labelStyle}>
            <span>Company Code (PHV-000001)</span>
            <input
              placeholder="PHV-000001"
              style={inputStyle}
              autoComplete="off"
              value={form.companyCode}
              onChange={(e) => setForm((p) => ({ ...p, companyCode: e.target.value }))}
            />
          </label>

          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            <span>Size of Employees (Informational)</span>
            <select
              style={inputStyle as React.CSSProperties}
              value={form.sizeOfEmployees}
              onChange={(e) => setForm((p) => ({ ...p, sizeOfEmployees: e.target.value }))}
            >
              <option value="">Select size</option>
              <option value="1-10">1-10</option>
              <option value="11-25">11-25</option>
              <option value="26-50">26-50</option>
              <option value="51-100">51-100</option>
              <option value="101-200">101-200</option>
              <option value="201-500">201-500</option>
            </select>
          </label>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Authorized Person</h2>
        <div style={grid2}>
          <label style={labelStyle}>
            <span>Authorized User Name *</span>
            <input
              placeholder="Full name"
              style={inputStyle}
              autoComplete="off"
              name="authorized_name"
              value={form.authorizedName}
              onChange={(e) => setForm((p) => ({ ...p, authorizedName: e.target.value }))}
            />
          </label>

          <label style={labelStyle}>
            <span>Mobile *</span>
            <input
              type="tel"
              maxLength={10}
              placeholder="10-digit mobile"
              style={inputStyle}
              autoComplete="off"
              value={form.mobile}
              onChange={(e) => setForm((p) => ({ ...p, mobile: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Address</h2>
        <div style={grid2}>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
            <span>Address *</span>
            <input
              placeholder="Street, area, building..."
              style={inputStyle}
              autoComplete="off"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            />
          </label>

          <label style={labelStyle}>
            <span>City *</span>
            <input
              placeholder="City"
              style={inputStyle}
              autoComplete="off"
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
            />
          </label>

          <label style={labelStyle}>
            <span>State *</span>
            <input
              placeholder="State"
              style={inputStyle}
              autoComplete="off"
              value={form.state}
              onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
            />
          </label>

          <label style={labelStyle}>
            <span>Country *</span>
            <input
              style={inputStyle}
              autoComplete="off"
              value={form.country}
              onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
            />
          </label>

          <label style={labelStyle}>
            <span>PIN Code *</span>
            <input
              type="text"
              maxLength={6}
              placeholder="6-digit PIN"
              style={inputStyle}
              autoComplete="off"
              value={form.pinCode}
              onChange={(e) => setForm((p) => ({ ...p, pinCode: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Plan</h2>
        <div style={grid2}>
          <label style={labelStyle}>
            <span>Plan *</span>
            <select
              style={inputStyle as React.CSSProperties}
              value={form.plan}
              onChange={(e) => setForm((p) => ({ ...p, plan: e.target.value as PlanType }))}
            >
              <option value="trial">Trial (7 Days)</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>

          <div style={labelStyle}>
            <span>Auto dates</span>
            <div style={hintBox}>
              Selected: <b>{planLabel}</b>
              <br />
              Preview: <b>{planPreview}</b>
              <br />
              Dates are enforced in backend policy logic.
            </div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Company Admin Login</h2>
        <div style={grid2}>
          <label style={labelStyle}>
            <span>Admin Email *</span>
            <input
              type="email"
              placeholder="admin@company.com"
              style={inputStyle}
              autoComplete="off"
              value={form.adminEmail}
              onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
            />
          </label>

          <label style={labelStyle}>
            <span>Admin Password *</span>
            <input
              placeholder="Set manually by Super Admin"
              type="password"
              style={inputStyle}
              autoComplete="new-password"
              value={form.adminPassword}
              onChange={(e) => setForm((p) => ({ ...p, adminPassword: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Optional</h2>
        <div style={grid2}>
          <label style={labelStyle}>
            <span>GST</span>
            <input
              placeholder="GSTIN (optional)"
              style={inputStyle}
              autoComplete="off"
              value={form.gst}
              onChange={(e) => setForm((p) => ({ ...p, gst: e.target.value }))}
            />
          </label>

          <label style={labelStyle}>
            <span>Business Nature</span>
            <input
              placeholder="e.g. Retail / IT / Manufacturing"
              style={inputStyle}
              autoComplete="off"
              value={form.businessNature}
              onChange={(e) => setForm((p) => ({ ...p, businessNature: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button
          type="button"
          disabled={!canCreate || saving}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: canCreate && !saving ? "#111" : "#999",
            color: "#fff",
            cursor: canCreate && !saving ? "pointer" : "not-allowed",
            opacity: canCreate && !saving ? 1 : 0.7,
          }}
          onClick={handleCreateCompany}
        >
          {saving ? "Creating..." : "Create Company"}
        </button>

        <Link
          href="/super/companies"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Cancel
        </Link>
      </div>

      {!canCreate && (
        <p style={{ marginTop: 10, color: "#b00020" }}>Please fill all mandatory (*) fields to enable Create Company.</p>
      )}
      {message && <p style={{ marginTop: 10, color: "#0f3d91" }}>{message}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  outline: "none",
};

const sectionStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #e5e5e5",
  borderRadius: 8,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
};

const grid2: React.CSSProperties = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const hintBox: React.CSSProperties = {
  padding: 8,
  background: "#fafafa",
  border: "1px solid #eee",
  borderRadius: 8,
};

const pageWrap: React.CSSProperties = {
  padding: "8px 8px 12px 4px",
  maxWidth: 760,
  margin: "0",
};
