import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Display form for a raw enum value shown to the user — a status, stage, type,
 * or role. Underscores become spaces and the first letter is capitalized, so
 * "stage_moved" reads "Stage moved". Statuses come out of the database
 * lowercase; every surface that shows one runs it through here so the same
 * value never reads two ways in two places.
 */
export function statusLabel(value: string | null | undefined): string {
  const text = (value ?? "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
