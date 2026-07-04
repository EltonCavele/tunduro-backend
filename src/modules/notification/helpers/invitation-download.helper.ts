export interface InvitationDownloadLinks {
  ios?: string;
  android?: string;
  fallback?: string;
}

export function invitationDownloadHtml(
  links?: InvitationDownloadLinks
): string {
  const fallback = links?.fallback;
  const ios = links?.ios || fallback;
  const android = links?.android || fallback;
  if (!ios && !android) return '';
  const iosButton = ios
    ? `<a href="${ios}" style="background:#111;color:#fff;padding:10px 14px;text-decoration:none;border-radius:6px;display:inline-block;margin-right:8px;">iPhone</a>`
    : '';
  const androidButton = android
    ? `<a href="${android}" style="background:#111;color:#fff;padding:10px 14px;text-decoration:none;border-radius:6px;display:inline-block;">Android</a>`
    : '';

  return `<div style="margin:24px 0 0;padding:16px;border:1px solid #eee;border-radius:8px;"><p style="margin:0 0 6px;"><strong>Ainda não tens a app?</strong></p><p style="margin:0 0 14px;color:#555;">Baixa a app Tunduru para acompanhar convites e reservas.</p><p style="margin:0;">${iosButton}${androidButton}</p></div>`;
}

export function invitationDownloadText(
  links?: InvitationDownloadLinks
): string {
  const fallback = links?.fallback;
  const ios = links?.ios || fallback;
  const android = links?.android || fallback;
  const lines = [
    ios ? `iPhone: ${ios}` : '',
    android ? `Android: ${android}` : '',
  ].filter(Boolean);

  return lines.length
    ? `\n\nAinda nao tens a app?\nBaixa a app Tunduru:\n${lines.join('\n')}`
    : '';
}
