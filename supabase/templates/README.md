# Supabase Auth email templates (Handshake-branded)

These are the transactional emails Supabase Auth sends (signup confirmation,
password reset, etc.). They are **separate** from the app's product emails
(campaigns/workflows/invites), which send through Resend — see `src/lib/email/`.
Supabase sends these via its own SMTP, so they must be configured in the
Supabase dashboard; there is no code path for them in this repo.

All six share one brand shell: the Handshake logo lockup, brand indigo
(`#0152cb`), Manrope/Lato with system fallbacks, and a light card on `#edf0f9`.
They're generated to match `src/app/globals.css` + `docs/07-design-system.md`.

## How to apply

Supabase Dashboard → **Authentication → Emails → Templates**. For each template
below, paste the **Subject** into the subject field and the **file contents**
into the message body (the HTML editor), then Save.

| Dashboard template | File | Subject | Fires in this app? |
|---|---|---|---|
| Confirm signup | `confirmation.html` | `Confirm your email for Handshake` | **Yes** — signup flow |
| Reset password | `recovery.html` | `Reset your Handshake password` | **Yes** — forgot-password flow |
| Magic Link | `magic_link.html` | `Your Handshake sign-in link` | No (not used yet) |
| Invite user | `invite.html` | `You've been invited to Handshake` | No — app uses its own Resend invite |
| Change Email Address | `email_change.html` | `Confirm your new email for Handshake` | No (not used yet) |
| Reauthentication | `reauthentication.html` | `Your Handshake verification code` | No (not used yet) |

The two live ones are **Confirm signup** and **Reset password** — do those first.
The rest are ready for when those flows get turned on.

## Important

- **Don't change the `{{ .ConfirmationURL }}` / `{{ .Token }}` variables.** They're
  Supabase (GoTrue) template variables — the links only work if left intact. The
  existing auth flow relies on `{{ .ConfirmationURL }}` redirecting to
  `/auth/callback`, so we re-skinned around it rather than changing the link.
- **Fonts:** Manrope/Lato load from Google Fonts for clients that support web
  fonts (Apple Mail, iOS); everywhere else they fall back to the system UI font.
- **Logo:** the mark is an inline SVG inside a blue rounded square. Clients that
  strip SVG (Gmail, Outlook) still show the blue square + the "Handshake"
  wordmark. For pixel-perfect rendering everywhere, host a 88×88 PNG of the mark
  and swap the `<svg>…</svg>` for `<img src="…" width="44" height="44" alt="Handshake" />`.
- **Regenerating:** these files are the source of truth. If you rebrand, update
  the tokens and re-run the generator (kept in scratchpad during the session) or
  edit the HTML directly.
- Optional: route these through Resend by setting custom SMTP in
  Supabase → Authentication → Emails → SMTP Settings (needs a verified domain).
