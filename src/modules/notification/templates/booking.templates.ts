import {
  Booking,
  BookingCheckoutSession,
  BookingInvitation,
  Court,
  User,
} from '@prisma/client';

export interface BookingNotificationContext {
  booking: Pick<
    Booking,
    | 'id'
    | 'startAt'
    | 'endAt'
    | 'totalPrice'
    | 'currency'
    | 'cancellationReason'
  >;
  court: Pick<Court, 'name'>;
  organizer: Pick<User, 'firstName' | 'email'>;
  appName: string;
  frontendUrl?: string;
}

export interface CheckoutSessionNotificationContext {
  session: Pick<
    BookingCheckoutSession,
    'id' | 'startAt' | 'endAt' | 'amount' | 'currency' | 'failureReason'
  >;
  court: Pick<Court, 'name'>;
  organizer: Pick<User, 'firstName' | 'email'>;
  appName: string;
  frontendUrl?: string;
}

export interface InvitationNotificationContext {
  booking: Pick<
    Booking,
    'id' | 'startAt' | 'endAt' | 'totalPrice' | 'currency'
  >;
  court: Pick<Court, 'name'>;
  inviter: Pick<User, 'firstName' | 'email'>;
  invitation: Pick<
    BookingInvitation,
    'id' | 'token' | 'expiresAt' | 'inviteeEmail' | 'invitedUserId'
  >;
  appName: string;
  frontendUrl?: string;
}

export interface BookingNotificationContent {
  pushTitle: string;
  pushBody: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
}

const dateFormatter = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Africa/Maputo',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Africa/Maputo',
  hour: '2-digit',
  minute: '2-digit',
});

function formatRange(start: Date, end: Date): string {
  return `${dateFormatter.format(start)} - ${timeFormatter.format(end)}`;
}

function formatAmount(amount: unknown, currency: string): string {
  const value = Number(amount ?? 0);
  return `${value.toFixed(2)} ${currency}`;
}

function safeName(user: Pick<User, 'firstName' | 'email'>): string {
  return user.firstName?.trim() || user.email;
}

function bookingLink(ctx: BookingNotificationContext): string | null {
  if (!ctx.frontendUrl) return null;
  const base = ctx.frontendUrl.replace(/\/+$/, '');
  return `${base}/bookings/${ctx.booking.id}`;
}

function wrapEmail(
  title: string,
  body: string,
  ctx: BookingNotificationContext
): string {
  const link = bookingLink(ctx);
  const cta = link
    ? `<p style="margin: 24px 0;"><a href="${link}" style="background:#111;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;">Ver reserva</a></p>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; max-width: 560px; margin: 0 auto;">
      <h2 style="margin: 0 0 12px 0;">${title}</h2>
      ${body}
      ${cta}
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
      <p style="color: #666; font-size: 12px; margin: 0;">${ctx.appName}</p>
    </div>
  `.trim();
}

function detailsHtml(ctx: BookingNotificationContext): string {
  const { booking, court } = ctx;
  return `
    <table style="border-collapse:collapse; font-size:14px; margin-top:8px;">
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Court</td><td style="padding:4px 0;">${court.name}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Horário</td><td style="padding:4px 0;">${formatRange(
        booking.startAt,
        booking.endAt
      )}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Valor</td><td style="padding:4px 0;">${formatAmount(
        booking.totalPrice,
        booking.currency
      )}</td></tr>
    </table>
  `.trim();
}

function detailsText(ctx: BookingNotificationContext): string {
  const { booking, court } = ctx;
  return [
    `Court: ${court.name}`,
    `Horário: ${formatRange(booking.startAt, booking.endAt)}`,
    `Valor: ${formatAmount(booking.totalPrice, booking.currency)}`,
  ].join('\n');
}

export function bookingCreatedByAdminTemplate(
  ctx: BookingNotificationContext
): BookingNotificationContent {
  const greeting = `Olá ${safeName(ctx.organizer)},`;
  const intro = `Foi criada uma reserva em seu nome. Confirme o pagamento para concluir o agendamento.`;

  return {
    pushTitle: 'Nova reserva criada',
    pushBody: `Confirme o pagamento para o slot de ${formatRange(
      ctx.booking.startAt,
      ctx.booking.endAt
    )}.`,
    emailSubject: `Nova reserva — confirme o pagamento`,
    emailHtml: wrapEmail(
      'Nova reserva criada',
      `<p>${greeting}</p><p>${intro}</p>${detailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${detailsText(ctx)}`,
  };
}

export function paymentConfirmedTemplate(
  ctx: BookingNotificationContext
): BookingNotificationContent {
  const greeting = `Olá ${safeName(ctx.organizer)},`;
  const intro = `O seu pagamento foi confirmado e a reserva está agendada.`;

  return {
    pushTitle: 'Pagamento confirmado',
    pushBody: `Reserva agendada para ${formatRange(
      ctx.booking.startAt,
      ctx.booking.endAt
    )}.`,
    emailSubject: 'Pagamento confirmado — reserva agendada',
    emailHtml: wrapEmail(
      'Pagamento confirmado',
      `<p>${greeting}</p><p>${intro}</p>${detailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${detailsText(ctx)}`,
  };
}

export function paymentFailedTemplate(
  ctx: BookingNotificationContext,
  providerMessage: string
): BookingNotificationContent {
  const greeting = `Olá ${safeName(ctx.organizer)},`;
  const intro = `Não conseguimos processar o pagamento da sua reserva, e por isso foi cancelada.`;
  const reason = `Motivo: ${providerMessage}`;

  return {
    pushTitle: 'Pagamento recusado',
    pushBody: `Reserva cancelada. ${providerMessage}`,
    emailSubject: 'Pagamento recusado — reserva cancelada',
    emailHtml: wrapEmail(
      'Pagamento recusado',
      `<p>${greeting}</p><p>${intro}</p><p style="color:#b00;"><strong>${reason}</strong></p>${detailsHtml(
        ctx
      )}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n${reason}\n\n${detailsText(ctx)}`,
  };
}

export function bookingCancelledByAdminTemplate(
  ctx: BookingNotificationContext,
  reason: string
): BookingNotificationContent {
  const greeting = `Olá ${safeName(ctx.organizer)},`;
  const intro = `A sua reserva foi cancelada pelo administrador.`;
  const reasonLine = reason ? `Motivo: ${reason}` : '';

  return {
    pushTitle: 'Reserva cancelada pelo admin',
    pushBody: reason
      ? `Reserva cancelada. Motivo: ${reason}`
      : 'A sua reserva foi cancelada pelo admin.',
    emailSubject: 'Reserva cancelada pelo admin',
    emailHtml: wrapEmail(
      'Reserva cancelada',
      `<p>${greeting}</p><p>${intro}</p>${
        reasonLine ? `<p>${reasonLine}</p>` : ''
      }${detailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}${
      reasonLine ? `\n${reasonLine}` : ''
    }\n\n${detailsText(ctx)}`,
  };
}

export function bookingExpiredTemplate(
  ctx: BookingNotificationContext
): BookingNotificationContent {
  const greeting = `Olá ${safeName(ctx.organizer)},`;
  const intro = `A sua reserva foi cancelada porque não recebemos a confirmação de pagamento a tempo.`;

  return {
    pushTitle: 'Reserva expirou',
    pushBody:
      'Não recebemos a confirmação do pagamento a tempo. Reserva cancelada.',
    emailSubject: 'Reserva expirada — pagamento não confirmado',
    emailHtml: wrapEmail(
      'Reserva expirada',
      `<p>${greeting}</p><p>${intro}</p>${detailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${detailsText(ctx)}`,
  };
}

export function checkInTemplate(
  ctx: BookingNotificationContext
): BookingNotificationContent {
  const greeting = `Olá ${safeName(ctx.organizer)},`;
  const intro = `O check-in da sua reserva foi confirmado. Boa partida!`;

  return {
    pushTitle: 'Check-in confirmado',
    pushBody: `Bom jogo no ${ctx.court.name}!`,
    emailSubject: 'Check-in confirmado',
    emailHtml: wrapEmail(
      'Check-in confirmado',
      `<p>${greeting}</p><p>${intro}</p>${detailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${detailsText(ctx)}`,
  };
}

export function bookingStartingSoonTemplate(
  ctx: BookingNotificationContext
): BookingNotificationContent {
  const greeting = `Olá ${safeName(ctx.organizer)},`;
  const startTime = timeFormatter.format(ctx.booking.startAt);
  const intro = `A sua reserva no ${ctx.court.name} começa às ${startTime}. Está a caminho?`;

  return {
    pushTitle: 'A sua reserva começa em 10 minutos',
    pushBody: `${ctx.court.name} às ${startTime}. Não chegues atrasado!`,
    emailSubject: 'A sua reserva começa em 10 minutos',
    emailHtml: wrapEmail(
      'A sua reserva começa em 10 minutos',
      `<p>${greeting}</p><p>${intro}</p>${detailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${detailsText(ctx)}`,
  };
}

export function bookingEndingSoonTemplate(
  ctx: BookingNotificationContext,
  canExtend = false
): BookingNotificationContent {
  const greeting = `Olá ${safeName(ctx.organizer)},`;
  const endTime = timeFormatter.format(ctx.booking.endAt);
  const intro = canExtend
    ? `A sua reserva no ${ctx.court.name} termina às ${endTime}. Podes prolongar +1 hora no app se confirmares o pagamento.`
    : `A sua reserva no ${ctx.court.name} termina às ${endTime}. Boa reta final!`;
  const pushBody = canExtend
    ? `${ctx.court.name} termina às ${endTime}. Prolonga +1h no app se a próxima hora estiver livre.`
    : `Reta final em ${ctx.court.name}. Termina às ${endTime}.`;

  return {
    pushTitle: 'A sua reserva termina em 10 minutos',
    pushBody,
    emailSubject: 'A sua reserva termina em 10 minutos',
    emailHtml: wrapEmail(
      'A sua reserva termina em 10 minutos',
      `<p>${greeting}</p><p>${intro}</p>${detailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${detailsText(ctx)}`,
  };
}

export function bookingExtendedTemplate(
  ctx: BookingNotificationContext
): BookingNotificationContent {
  const greeting = `Olá ${safeName(ctx.organizer)},`;
  const endTime = timeFormatter.format(ctx.booking.endAt);
  const intro = `A sua reserva no ${ctx.court.name} foi prolongada por mais 1 hora. Novo fim: ${endTime}.`;

  return {
    pushTitle: 'Reserva prolongada com sucesso',
    pushBody: `${ctx.court.name} até às ${endTime}. Boa continuação!`,
    emailSubject: 'A sua reserva foi prolongada',
    emailHtml: wrapEmail(
      'Reserva prolongada com sucesso',
      `<p>${greeting}</p><p>${intro}</p>${detailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${detailsText(ctx)}`,
  };
}

function sessionLink(ctx: CheckoutSessionNotificationContext): string | null {
  if (!ctx.frontendUrl) return null;
  const base = ctx.frontendUrl.replace(/\/+$/, '');
  return `${base}/bookings/checkout/${ctx.session.id}`;
}

function wrapSessionEmail(
  title: string,
  body: string,
  ctx: CheckoutSessionNotificationContext,
  ctaLabel = 'Ver checkout'
): string {
  const link = sessionLink(ctx);
  const cta = link
    ? `<p style="margin: 24px 0;"><a href="${link}" style="background:#111;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;">${ctaLabel}</a></p>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; max-width: 560px; margin: 0 auto;">
      <h2 style="margin: 0 0 12px 0;">${title}</h2>
      ${body}
      ${cta}
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
      <p style="color: #666; font-size: 12px; margin: 0;">${ctx.appName}</p>
    </div>
  `.trim();
}

function sessionDetailsHtml(ctx: CheckoutSessionNotificationContext): string {
  const { session, court } = ctx;
  return `
    <table style="border-collapse:collapse; font-size:14px; margin-top:8px;">
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Court</td><td style="padding:4px 0;">${court.name}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Horário</td><td style="padding:4px 0;">${formatRange(
        session.startAt,
        session.endAt
      )}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Valor</td><td style="padding:4px 0;">${formatAmount(
        session.amount,
        session.currency
      )}</td></tr>
    </table>
  `.trim();
}

function sessionDetailsText(ctx: CheckoutSessionNotificationContext): string {
  const { session, court } = ctx;
  return [
    `Court: ${court.name}`,
    `Horário: ${formatRange(session.startAt, session.endAt)}`,
    `Valor: ${formatAmount(session.amount, session.currency)}`,
  ].join('\n');
}

export function checkoutCreatedByAdminTemplate(
  ctx: CheckoutSessionNotificationContext
): BookingNotificationContent {
  const greeting = `Olá ${ctx.organizer.firstName?.trim() || ctx.organizer.email},`;
  const intro = `Foi iniciada uma reserva em seu nome. Confirme o pagamento para concluir o agendamento.`;

  return {
    pushTitle: 'Nova reserva — confirme o pagamento',
    pushBody: `Confirme o pagamento para o slot de ${formatRange(
      ctx.session.startAt,
      ctx.session.endAt
    )}.`,
    emailSubject: 'Nova reserva — confirme o pagamento',
    emailHtml: wrapSessionEmail(
      'Nova reserva — confirme o pagamento',
      `<p>${greeting}</p><p>${intro}</p>${sessionDetailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${sessionDetailsText(ctx)}`,
  };
}

export function checkoutFailedTemplate(
  ctx: CheckoutSessionNotificationContext,
  providerMessage: string
): BookingNotificationContent {
  const greeting = `Olá ${ctx.organizer.firstName?.trim() || ctx.organizer.email},`;
  const intro = `Não conseguimos processar o pagamento, por isso a reserva não foi efectuada.`;
  const reason = `Motivo: ${providerMessage}`;

  return {
    pushTitle: 'Pagamento recusado',
    pushBody: `Reserva não efectuada. ${providerMessage}`,
    emailSubject: 'Pagamento recusado — reserva não efectuada',
    emailHtml: wrapSessionEmail(
      'Pagamento recusado',
      `<p>${greeting}</p><p>${intro}</p><p style="color:#b00;"><strong>${reason}</strong></p>${sessionDetailsHtml(
        ctx
      )}`,
      ctx,
      'Tentar novamente'
    ),
    emailText: `${greeting}\n\n${intro}\n${reason}\n\n${sessionDetailsText(ctx)}`,
  };
}

export function checkoutExpiredTemplate(
  ctx: CheckoutSessionNotificationContext
): BookingNotificationContent {
  const greeting = `Olá ${ctx.organizer.firstName?.trim() || ctx.organizer.email},`;
  const intro = `A sua sessão de pagamento expirou e o slot foi liberado. Se ainda quiser reservar, inicie um novo checkout.`;

  return {
    pushTitle: 'Sessão de pagamento expirou',
    pushBody: 'Não recebemos a confirmação a tempo. O slot foi liberado.',
    emailSubject: 'Sessão de pagamento expirada',
    emailHtml: wrapSessionEmail(
      'Sessão de pagamento expirada',
      `<p>${greeting}</p><p>${intro}</p>${sessionDetailsHtml(ctx)}`,
      ctx,
      'Iniciar nova reserva'
    ),
    emailText: `${greeting}\n\n${intro}\n\n${sessionDetailsText(ctx)}`,
  };
}

function inviterDisplay(ctx: InvitationNotificationContext): string {
  return ctx.inviter.firstName?.trim() || ctx.inviter.email;
}

function invitationLink(ctx: InvitationNotificationContext): string | null {
  if (!ctx.frontendUrl) return null;
  const base = ctx.frontendUrl.replace(/\/+$/, '');
  return `${base}/invite/${ctx.invitation.token}`;
}

function invitationDetailsHtml(ctx: InvitationNotificationContext): string {
  const { booking, court } = ctx;
  return `
    <table style="border-collapse:collapse; font-size:14px; margin-top:8px;">
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Court</td><td style="padding:4px 0;">${court.name}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Horário</td><td style="padding:4px 0;">${formatRange(
        booking.startAt,
        booking.endAt
      )}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">Convidado por</td><td style="padding:4px 0;">${inviterDisplay(
        ctx
      )}</td></tr>
    </table>
  `.trim();
}

function invitationDetailsText(ctx: InvitationNotificationContext): string {
  const { booking, court } = ctx;
  return [
    `Court: ${court.name}`,
    `Horário: ${formatRange(booking.startAt, booking.endAt)}`,
    `Convidado por: ${inviterDisplay(ctx)}`,
  ].join('\n');
}

function wrapInvitationEmail(
  title: string,
  body: string,
  ctx: InvitationNotificationContext
): string {
  const link = invitationLink(ctx);
  const cta = link
    ? `<p style="margin: 24px 0;">
         <a href="${link}" style="background:#111;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;margin-right:8px;">Aceitar</a>
         <a href="${link}?action=decline" style="background:#eee;color:#111;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;">Recusar</a>
       </p>
       <p style="color:#666;font-size:12px;">Se o botão não abrir, copia este link: ${link}</p>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; max-width: 560px; margin: 0 auto;">
      <h2 style="margin: 0 0 12px 0;">${title}</h2>
      ${body}
      ${cta}
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
      <p style="color: #666; font-size: 12px; margin: 0;">${ctx.appName}</p>
    </div>
  `.trim();
}

export function invitationCreatedTemplate(
  ctx: InvitationNotificationContext
): BookingNotificationContent {
  const inviter = inviterDisplay(ctx);
  const greeting = `Olá,`;
  const intro = `${inviter} convidou-te para uma partida no ${ctx.court.name}, ${formatRange(
    ctx.booking.startAt,
    ctx.booking.endAt
  )}. Confirma a tua presença na app.`;
  const link = invitationLink(ctx);
  const linkLine = link ? `\n\nResponde aqui: ${link}` : '';

  return {
    pushTitle: 'Foste convidado para uma partida',
    pushBody: `${inviter} convidou-te para ${ctx.court.name} (${formatRange(
      ctx.booking.startAt,
      ctx.booking.endAt
    )}).`,
    emailSubject: `${inviter} convidou-te para uma partida`,
    emailHtml: wrapInvitationEmail(
      'Foste convidado para uma partida',
      `<p>${greeting}</p><p>${intro}</p>${invitationDetailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${invitationDetailsText(ctx)}${linkLine}`,
  };
}

export function invitationAcceptedTemplate(
  ctx: InvitationNotificationContext,
  guestName: string
): BookingNotificationContent {
  const greeting = `Olá ${inviterDisplay(ctx)},`;
  const intro = `${guestName} aceitou o convite para a partida no ${ctx.court.name}.`;

  return {
    pushTitle: 'Convite aceite',
    pushBody: `${guestName} vai à partida em ${ctx.court.name}.`,
    emailSubject: `${guestName} aceitou o teu convite`,
    emailHtml: wrapInvitationEmail(
      'Convite aceite',
      `<p>${greeting}</p><p>${intro}</p>${invitationDetailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${invitationDetailsText(ctx)}`,
  };
}

export function invitationDeclinedTemplate(
  ctx: InvitationNotificationContext,
  guestName: string
): BookingNotificationContent {
  const greeting = `Olá ${inviterDisplay(ctx)},`;
  const intro = `${guestName} não vai poder ir à partida no ${ctx.court.name}.`;

  return {
    pushTitle: 'Convite recusado',
    pushBody: `${guestName} recusou o convite.`,
    emailSubject: `${guestName} recusou o teu convite`,
    emailHtml: wrapInvitationEmail(
      'Convite recusado',
      `<p>${greeting}</p><p>${intro}</p>${invitationDetailsHtml(ctx)}`,
      ctx
    ),
    emailText: `${greeting}\n\n${intro}\n\n${invitationDetailsText(ctx)}`,
  };
}
