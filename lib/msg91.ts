type OtpPurpose = "first_login" | "reset_pin";

type SendOtpResult =
  | { ok: true; skipped: boolean; requestId?: string }
  | { ok: false; error: string };

const MSG91_FLOW_ENDPOINT = "https://api.msg91.com/api/v5/flow/";

function getMsg91AuthKey() {
  return process.env.MSG91_AUTH_KEY?.trim() || "";
}

function getMsg91CountryCode() {
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

export function hasMsg91ConfigForPurpose(purpose: OtpPurpose) {
  return Boolean(getMsg91AuthKey() && getMsg91FlowId(purpose));
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

  const countryCode = getMsg91CountryCode();
  const otpVariableName = getMsg91OtpVariableName();
  const mobile = `${countryCode}${input.mobile}`;
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
    type?: string;
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
