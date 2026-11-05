export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Email-client-safe tables and inline CSS; no remote fonts, images, trackers, or hidden text. */
export function emailLayout(heading: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeEmailHtml(heading)}</title></head>
<body style="margin:0;padding:0;background-color:#f8f6f1;color:#252525;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f6f1"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2dbce;border-radius:12px">
<tr><td style="padding:28px 28px 22px;border-bottom:1px solid #e8e1d5"><div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2"><span style="color:#956a24">LA</span> Chef</div><div style="margin-top:6px;font-size:10px;line-height:1.5;letter-spacing:1.5px;color:#666259">EVENT CATERING SERVICES</div></td></tr>
<tr><td style="padding:28px;font-size:14px;line-height:1.65;color:#45443e"><h1 style="margin:0 0 22px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;font-weight:400;color:#202020">${escapeEmailHtml(heading)}</h1>${content}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e8e1d5;font-size:12px;line-height:1.6;color:#6c685f">LA Chef Event Catering Services<br>This is an automated account and reservation notification.</td></tr>
</table></td></tr></table></body></html>`;
}
export const emailParagraph = (value: string) => `<p style="margin:0 0 16px">${escapeEmailHtml(value)}</p>`;
