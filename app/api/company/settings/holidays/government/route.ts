import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { GovernmentHolidayState } from "@/lib/governmentHolidays";

function normalizeYear(value: string | null) {
  const numeric = Number(value || "");
  if (!Number.isFinite(numeric)) return new Date().getFullYear();
  return Math.max(2000, Math.min(2100, Math.floor(numeric)));
}

function normalizeState(value: string | null): GovernmentHolidayState {
  if (value === "maharashtra" || value === "karnataka" || value === "gujarat" || value === "tamil_nadu") {
    return value;
  }
  return "all_india";
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const year = normalizeYear(req.nextUrl.searchParams.get("year"));
  const state = normalizeState(req.nextUrl.searchParams.get("state"));

  const stateCandidates = state === "all_india" ? ["all_india"] : [state, "all_india"];
  let selectedState = "";
  let setId = "";
  let source = {
    name: "Super Admin Published Template",
    url: "",
    mode: "published_template",
    lastUpdated: "",
  };

  for (const candidate of stateCandidates) {
    const { data: setRow, error: setError } = await context.admin
      .from("government_holiday_template_sets")
      .select("id,state,last_updated_at")
      .eq("year", year)
      .eq("state", candidate)
      .eq("published", true)
      .maybeSingle();
    if (setError) {
      return NextResponse.json({ error: setError.message || "Unable to load published holiday template." }, { status: 400 });
    }
    if (setRow?.id) {
      selectedState = String(setRow.state || candidate);
      setId = String(setRow.id);
      source = {
        name: candidate === state ? "Super Admin Published Template" : "Super Admin Published Template (All India fallback)",
        url: "",
        mode: "published_template",
        lastUpdated: String(setRow.last_updated_at || ""),
      };
      break;
    }
  }

  if (!setId) {
    return NextResponse.json(
      { error: `No published holiday template found for ${year} (${state}). Ask Super Admin to publish template first.` },
      { status: 400 }
    );
  }

  const { data: rowsData, error: rowsError } = await context.admin
    .from("government_holiday_template_rows")
    .select("holiday_date,name,type,scope")
    .eq("template_set_id", setId)
    .order("holiday_date", { ascending: true })
    .order("name", { ascending: true });
  if (rowsError) {
    return NextResponse.json({ error: rowsError.message || "Unable to load published holiday template rows." }, { status: 400 });
  }

  return NextResponse.json({
    year,
    state: selectedState || state,
    source,
    rows: Array.isArray(rowsData)
      ? rowsData.map((row) => ({
        key: `${String(row.holiday_date || "")}|${String(row.name || "").toLowerCase()}`,
        date: String(row.holiday_date || ""),
        name: String(row.name || ""),
        type: row.type === "national" ? "national" : "festival",
        scope: row.scope === "state" ? "state" : "national",
      }))
      : [],
  });
}
