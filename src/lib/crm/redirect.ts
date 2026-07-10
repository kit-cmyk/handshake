// Shared OAuth redirect-URI builder. The connect route and the callback route
// MUST produce the identical redirect_uri or the token exchange fails, so both
// derive it here. Prefers the configured public site URL, falling back to the
// request's own origin for local dev.

export function crmRedirectUri(request: Request, type: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  return `${base.replace(/\/+$/, "")}/api/crm/${type}/callback`;
}
