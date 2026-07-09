import { cn } from "@/lib/utils";

/**
 * Renders a user's avatar image (uploaded photo or generated illustration).
 * `src` should come from `resolveAvatar()`.
 */
export function UserAvatar({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URIs & Supabase URLs, no need for next/image
    <img
      src={src}
      alt={alt}
      className={cn(
        "size-8 shrink-0 rounded-full border border-border bg-muted object-cover",
        className
      )}
    />
  );
}
