// Shared OAuth redirect-URI builder for connected mailboxes. The connect route
// and the callback route MUST produce the identical redirect_uri or the token
// exchange fails, so both derive it here. Prefers the configured public site
// URL, falling back to the request's own origin for local dev. Mirrors
// src/lib/crm/redirect.ts.

export function mailboxRedirectUri(request: Request, type: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  return `${base.replace(/\/+$/, "")}/api/mailboxes/${type}/callback`;
}
