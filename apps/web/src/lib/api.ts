/**
 * Shared browser-side API helper.
 *
 * The error class carries the HTTP status and the stable server error code so a
 * page can distinguish "this feature is disabled for the deployment" from a
 * transient failure without parsing message text. The message itself is exactly
 * the message the API sent, so existing call sites keep their current behaviour.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && init.body !== null && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { credentials: "same-origin", ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message: string = body.error?.message ?? "The request could not be completed.";
    const diagnosticCode = body.error?.diagnosticCode;
    const code = typeof body.error?.code === "string" ? body.error.code : null;
    throw new ApiRequestError(
      typeof diagnosticCode === "string" ? `${message} (${diagnosticCode})` : message,
      response.status,
      code
    );
  }
  return body.data as T;
}
