import { createAvatar } from "@dicebear/core";
import { openPeeps } from "@dicebear/collection";

/**
 * Deterministic "open peeps" illustration for a user, seeded by a stable
 * value (their id or email). Returns an inline SVG data URI — no network,
 * same face every time for the same seed.
 */
export function generatedAvatar(seed: string): string {
  return createAvatar(openPeeps, {
    seed: seed || "handshake",
    size: 96,
    backgroundColor: ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf"],
    backgroundType: ["gradientLinear", "solid"],
  }).toDataUri();
}

/**
 * The avatar to render for a user: their uploaded photo if present,
 * otherwise a generated illustration seeded from a stable identifier.
 */
export function resolveAvatar(
  seed: string,
  uploadedUrl?: string | null
): string {
  return uploadedUrl?.trim() ? uploadedUrl : generatedAvatar(seed);
}
