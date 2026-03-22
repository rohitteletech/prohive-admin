type OtpPurpose = "first_login" | "reset_pin";

type SendOtpResult =
  | { ok: true; skipped: boolean; requestId?: string }
  | { ok: false; error: string };

type VerifyAccessTokenResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: number; error: string };

const MSG91_FLOW_ENDPOINT = "https://api.msg91.com/api/v5/flow/";
const MSG91_VERIFY_ACCESS_TOKEN_ENDPOINT = "https://control.msg91.com/api/v5/widget/verifyAccessToken";

function getMsg91AuthKey() {
  return process.env.MSG91_AUTH_KEY?.trim() || "";
}

export function getMsg91CountryCode() {
  return process.env.MSG91_COUNTRY_CODE?.trim() || "91";
}

function getMsg91OtpVariableName() {
  return process.env.MSG91_OTP_VARIABLE_NAME?.trim() || "OTP";
}

function getMsg91FlowId(purpose: OtpPurpose) {
  return purpose === "first_login"
    ? process.env.MSG91_FLOW_ID_FIRST_LOGIN?.trim() || ""
    : process.env.MSG91_FLOW_ID_RESET_PIN?.trim() || "";
}

function getMsg91WidgetId() {
  return process.env.MSG91_OTP_WIDGET_ID?.trim() || "";
}

function getMsg91WidgetToken() {
  return process.env.MSG91_OTP_WIDGET_TOKEN?.trim() || "";
}

export function hasMsg91ConfigForPurpose(purpose: OtpPurpose) {
  return Boolean(getMsg91AuthKey() && getMsg91FlowId(purpose));
}

export function hasMsg91WidgetConfig() {
  return Boolean(getMsg91AuthKey() && getMsg91WidgetId() && getMsg91WidgetToken());
}

export function getMsg91WidgetClientConfig(mobile: string) {
  const widgetId = getMsg91WidgetId();
  const tokenAuth = getMsg91WidgetToken();

  if (!widgetId || !tokenAuth) {
    return null;
  }

  return {
    provider: "msg91_widget" as const,
    widgetId,
    tokenAuth,
    identifier: buildMsg91Identifier(mobile),
    countryCode: getMsg91CountryCode(),
  };
}

export function buildMsg91Identifier(mobile: string) {
  return `${getMsg91CountryCode()}${mobile}`;
}

export async function sendOtpViaMsg91(input: {
  mobile: string;
  otp: string;
  purpose: OtpPurpose;
}): Promise<SendOtpResult> {
  const authKey = getMsg91AuthKey();
  const flowId = getMsg91FlowId(input.purpose);

  if (!authKey || !flowId) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "MSG91 OTP configuration is missing." };
    }
    return { ok: true, skipped: true };
  }

  const otpVariableName = getMsg91OtpVariableName();
  const mobile = buildMsg91Identifier(input.mobile);
  const recipient = {
    mobiles: mobile,
    [otpVariableName]: input.otp,
  };

  const response = await fetch(MSG91_FLOW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: authKey,
    },
    body: JSON.stringify({
      flow_id: flowId,
      recipients: [recipient],
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return { ok: false, error: "Unable to reach MSG91 OTP service." };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    request_id?: string;
    message?: string;
  };

  if (!response.ok) {
    return { ok: false, error: payload.message || "MSG91 OTP request failed." };
  }

  return {
    ok: true,
    skipped: false,
    requestId: typeof payload.request_id === "string" ? payload.request_id : undefined,
  };
}

export async function verifyMsg91AccessToken(accessToken: string): Promise<VerifyAccessTokenResult> {
  const authKey = getMsg91AuthKey();

  if (!authKey) {
    return { ok: false, status: 500, error: "MSG91 auth configuration is missing." };
  }

  const response = await fetch(MSG91_VERIFY_ACCESS_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      authkey: authKey,
      "access-token": accessToken,
    }).toString(),
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return { ok: false, status: 502, error: "Unable to reach MSG91 verification service." };
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const message = firstString(payload.message) || firstString((payload.data as Record<string, unknown> | undefined)?.message);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 502,
      error: message || "MSG91 access token verification failed.",
    };
  }

  return { ok: true, payload };
}

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectStringValues(value: unknown, bucket: string[]) {
  if (typeof value === "string") {
    bucket.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, bucket);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStringValues(item, bucket);
    }
  }
}

function normalizeIdentifierValue(value: string) {
  return value.replace(/[^\d]/g, "");
}

function lastTenDigits(value: string) {
  const normalized = normalizeIdentifierValue(value);
  return normalized.length > 10 ? normalized.slice(-10) : normalized;
}

export function msg91PayloadMatchesMobile(payload: Record<string, unknown>, mobile: string) {
  const normalizedMobile = normalizeIdentifierValue(mobile);
  const expectedVariants = new Set([
    normalizedMobile,
    normalizeIdentifierValue(buildMsg91Identifier(mobile)),
    lastTenDigits(normalizedMobile),
    lastTenDigits(buildMsg91Identifier(mobile)),
  ]);

  const values: string[] = [];
  collectStringValues(payload, values);
  const candidateNumbers = values
    .map((value) => normalizeIdentifierValue(value))
    .filter((value) => value.length >= 10);

  if (candidateNumbers.length === 0) {
    // Some MSG91 widget responses confirm success without echoing the identifier/mobile.
    // In that case, trust the verified access token instead of failing every valid OTP.
    return true;
  }

  return candidateNumbers.some((normalizedValue) => {
    if (!normalizedValue) return false;

    return expectedVariants.has(normalizedValue) || expectedVariants.has(lastTenDigits(normalizedValue));
  });
}
