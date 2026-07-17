// Client-safe, responsive HTML shell for outbound email. Every send path passes
// its final HTML (after merge tags, click/open tracking, and the unsubscribe
// footer) through wrapEmail() so all product emails render consistently across
// mail clients. Table-based layout + inline styles are used deliberately —
// Outlook and Gmail strip <style> blocks and ignore modern CSS.

// Brand fonts (Google Sans primary, Nunito Sans secondary) lead the stack for
// clients that load the web fonts linked in <head> (Apple Mail, iOS Mail).
// Outlook/Gmail ignore web fonts and fall through to the system sans-serif tail.
const FONT_STACK =
  "'Google Sans','Nunito Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Wrap an HTML body fragment in the email shell. `preheader` is the short
 * preview text shown in the inbox list next to the subject (hidden in-body).
 */
export function wrapEmail(
  innerHtml: string,
  opts: { preheader?: string } = {}
): string {
  const preheader = opts.preheader
    ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden">${opts.preheader}</span>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-text-size-adjust:100%;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
<tr>
<td style="padding:32px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#18181b;">
${innerHtml}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
