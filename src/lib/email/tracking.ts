// Open- and click-tracking for campaign emails. Tokens are HMAC-signed so the
// public tracking routes can trust the encoded contact/campaign/step/org (and,
// for clicks, the destination URL) without a DB lookup and without being
// forgeable — which also closes the open-redirect hole on the click route.

import crypto from "node:crypto";

export type TrackContext = {
  orgId: string;
  contactId: string;
  campaignId: string;
  stepId: string;
};

/**
 * Click tokens additionally carry the (signed) destination URL; reply tokens
 * carry the enrollment id (`e`) so an inbound reply can be routed back.
 */
type Payload = {
  o: string;
  c: string;
  ca: string;
  s: string;
  u?: string;
  e?: string;
};

function secret(): string {
  return (
    process.env.TRACKING_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dev-tracking-secret"
  );
}

function sign(body: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64url")
    .slice(0, 24);
}

function encode(p: Payload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): Payload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // Constant-time compare against the recomputed signature.
  const expected = sign(body);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
  } catch {
    return null;
  }
}

export function openToken(ctx: TrackContext): string {
  return encode({ o: ctx.orgId, c: ctx.contactId, ca: ctx.campaignId, s: ctx.stepId });
}

export function clickToken(ctx: TrackContext, url: string): string {
  return encode({
    o: ctx.orgId,
    c: ctx.contactId,
    ca: ctx.campaignId,
    s: ctx.stepId,
    u: url,
  });
}

export type ResolvedTrack = TrackContext & { url: string | null };

export function verifyToken(token: string): ResolvedTrack | null {
  const p = decode(token);
  if (!p || !p.o || !p.c || !p.ca || !p.s) return null;
  return {
    orgId: p.o,
    contactId: p.c,
    campaignId: p.ca,
    stepId: p.s,
    url: p.u ?? null,
  };
}

/** Signed token identifying an enrollment, embedded in the Reply-To address. */
export function replyToken(ctx: TrackContext, enrollmentId: string): string {
  return encode({
    o: ctx.orgId,
    c: ctx.contactId,
    ca: ctx.campaignId,
    s: ctx.stepId,
    e: enrollmentId,
  });
}

export type ResolvedReply = ResolvedTrack & { enrollmentId: string };

export function verifyReplyToken(token: string): ResolvedReply | null {
  const p = decode(token);
  if (!p || !p.o || !p.c || !p.ca || !p.e) return null;
  return {
    orgId: p.o,
    contactId: p.c,
    campaignId: p.ca,
    stepId: p.s,
    url: null,
    enrollmentId: p.e,
  };
}

/**
 * Reply-To address for an enrollment: `reply+<token>@<domain>`. An inbound
 * mail provider (or IMAP poller) forwards replies to this address, and the
 * inbound webhook decodes the token to mark the enrollment replied.
 */
export function replyAddress(ctx: TrackContext, enrollmentId: string): string {
  const domain = process.env.REPLY_DOMAIN ?? "reply.handshake.local";
  return `reply+${replyToken(ctx, enrollmentId)}@${domain}`;
}

/** Extract the reply token from a `reply+<token>@domain` address. */
export function tokenFromReplyAddress(address: string): string | null {
  const m = /reply\+([^@]+)@/i.exec(address);
  return m ? m[1] : null;
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Append a 1x1 open-tracking pixel to the email HTML. */
export function withOpenPixel(html: string, ctx: TrackContext): string {
  const src = `${baseUrl()}/api/track/open/${openToken(ctx)}`;
  return `${html}<img src="${src}" width="1" height="1" alt="" style="display:none;max-height:0;overflow:hidden" />`;
}

/**
 * Rewrite absolute http(s) links in the body so clicks are logged before
 * redirecting to the original URL. Call this on the body BEFORE the unsubscribe
 * footer is appended, so the unsubscribe link itself stays untracked and intact.
 */
export function withClickTracking(html: string, ctx: TrackContext): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (_m, url: string) =>
      `href="${baseUrl()}/api/track/click/${clickToken(ctx, url)}"`
  );
}

/** Transparent 1x1 GIF payload for the open pixel. */
export const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);
