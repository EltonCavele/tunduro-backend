import {
  invitationDownloadHtml,
  invitationDownloadText,
  type InvitationDownloadLinks,
} from 'src/modules/notification/helpers/invitation-download.helper';

interface UserContactInviteEmailArgs {
  appName: string;
  downloadLinks?: InvitationDownloadLinks;
}

export function buildUserContactInviteEmail(args: UserContactInviteEmailArgs) {
  const title = `Foste convidado para o ${args.appName}`;
  const intro =
    'Um amigo quer jogar contigo. Baixa a app para receber convites e acompanhar reservas.';
  const downloadHtml = invitationDownloadHtml(args.downloadLinks);
  const downloadText = invitationDownloadText(args.downloadLinks);

  return {
    subject: title,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;max-width:560px;margin:0 auto;">
        <h2 style="margin:0 0 12px 0;">${title}</h2>
        <p style="margin:0 0 12px 0;">${intro}</p>
        ${downloadHtml}
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />
        <p style="color:#666;font-size:12px;margin:0;">${args.appName}</p>
      </div>
    `.trim(),
    text: `${title}\n\n${intro}${downloadText}`,
  };
}
