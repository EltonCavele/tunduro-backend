# Estruturas — Checkout M-Pesa

Referência rápida com todos os tipos, requests, responses, enums e wrappers
usados pelo fluxo de checkout M-Pesa. Pensado para colar directamente nos
ficheiros de tipos do frontend (TS), ou para alimentar uma IA a gerar
clients/hooks.

> Complementa o documento de migração [front-ai-booking-mpesa-migration.md](./front-ai-booking-mpesa-migration.md).
> Aqui só estão **estruturas**; lá está o **fluxo**.

---

## 1. Wrapper de resposta da API

Todas as responses de sucesso vêm encapsuladas neste wrapper. Os exemplos
deste documento mostram apenas o `data`; lembra-te que o body real tem este
shell à volta.

```ts
interface ApiResponse<T> {
  statusCode: number;        // 200, 201, ...
  message: string;            // já traduzida (i18n)
  timestamp: string;          // ISO-8601
  data: T;
}

interface ApiPaginatedData<T> {
  items: T[];
  metadata: {
    currentPage: number;
    itemsPerPage: number;
    totalItems: number;
    totalPages: number;
  };
}
```

Erros usam:

```ts
interface ApiErrorResponse {
  statusCode: number;         // 400, 401, 403, 404, 409, 500
  message: string;            // chave i18n traduzida
  timestamp: string;
  error?: unknown;            // detalhes opcionais
}
```

---

## 2. Enums

```ts
type BookingCheckoutSessionStatus =
  | 'OPEN'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'PAYMENT_FAILED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

type BookingStatus =
  | 'PENDING'           // legacy, novos bookings já não nascem aqui
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED';

type ParticipantStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'REMOVED';

type PaymentMethod =
  | 'MPESA'             // único suportado neste fluxo
  | 'EMOLA'
  | 'CARD'
  | 'CASH';

type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

type PaymentType =
  | 'BOOKING'
  | 'REFUND'
  | 'PENALTY'
  | 'OTHER';
```

Estados terminais da session: `COMPLETED`, `PAYMENT_FAILED`, `EXPIRED`.
Para o tier de checkout M-Pesa nunca verás `REFUND_PENDING` / `REFUNDED`
(reservados para o futuro).

---

## 3. `BookingCheckoutSession`

### Response DTO

Devolvido por:
- `POST /v1/bookings`
- `POST /v1/admin/booking`
- `GET /v1/bookings/checkout/:sessionId`
- `GET /v1/admin/booking/checkout/:sessionId`

```ts
interface BookingCheckoutSession {
  id: string;                 // UUID da session (≠ bookingId)
  status: BookingCheckoutSessionStatus;

  /**
   * Preenchido APENAS quando status === 'COMPLETED'.
   * Usar para chamar GET /v1/bookings/:bookingId.
   */
  bookingId: string | null;

  organizerId: string;
  courtId: string;

  startAt: string;            // ISO-8601
  endAt: string;              // ISO-8601
  durationMinutes: number;

  amount: number;             // ex. 500
  currency: string;           // ex. "MZN"
  reference: string;          // ex. "PAY-AB12CD34"

  paymentMethod: PaymentMethod | null;

  /**
   * MSISDN mascarado, e.g. "*** 4567".
   * Nunca chega o número completo ao frontend.
   */
  phone: string | null;

  /**
   * Preenchido quando status === 'PAYMENT_FAILED' ou 'EXPIRED'.
   * Formato: "INS-9: Request timeout" ou "session timeout".
   */
  failureReason: string | null;

  expiresAt: string;          // limite para o cliente confirmar PIN
  paidAt: string | null;      // populado em COMPLETED
  completedAt: string | null; // populado em COMPLETED

  createdAt: string;
  updatedAt: string;
}
```

### Exemplo: session OPEN (acabou de ser criada)

```json
{
  "id": "5b2a1f9c-8d4f-4f1d-a7f1-1b2cb3d5e6f7",
  "status": "OPEN",
  "bookingId": null,
  "organizerId": "user-uuid",
  "courtId": "court-uuid",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt":   "2026-05-10T17:00:00.000Z",
  "durationMinutes": 60,
  "amount": 500,
  "currency": "MZN",
  "reference": "PAY-AB12CD34",
  "paymentMethod": "MPESA",
  "phone": "*** 4567",
  "failureReason": null,
  "expiresAt": "2026-05-10T16:30:00.000Z",
  "paidAt": null,
  "completedAt": null,
  "createdAt": "2026-05-10T16:00:01.000Z",
  "updatedAt": "2026-05-10T16:00:01.000Z"
}
```

### Exemplo: session COMPLETED

```json
{
  "id": "5b2a1f9c-8d4f-4f1d-a7f1-1b2cb3d5e6f7",
  "status": "COMPLETED",
  "bookingId": "9c8d7e6f-1234-5678-9abc-def012345678",
  "organizerId": "user-uuid",
  "courtId": "court-uuid",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt":   "2026-05-10T17:00:00.000Z",
  "durationMinutes": 60,
  "amount": 500,
  "currency": "MZN",
  "reference": "PAY-AB12CD34",
  "paymentMethod": "MPESA",
  "phone": "*** 4567",
  "failureReason": null,
  "expiresAt": "2026-05-10T16:30:00.000Z",
  "paidAt": "2026-05-10T16:00:08.000Z",
  "completedAt": "2026-05-10T16:00:08.000Z",
  "createdAt": "2026-05-10T16:00:01.000Z",
  "updatedAt": "2026-05-10T16:00:08.000Z"
}
```

### Exemplo: session PAYMENT_FAILED

```json
{
  "id": "5b2a1f9c-8d4f-4f1d-a7f1-1b2cb3d5e6f7",
  "status": "PAYMENT_FAILED",
  "bookingId": null,
  "organizerId": "user-uuid",
  "courtId": "court-uuid",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt":   "2026-05-10T17:00:00.000Z",
  "durationMinutes": 60,
  "amount": 500,
  "currency": "MZN",
  "reference": "PAY-AB12CD34",
  "paymentMethod": "MPESA",
  "phone": "*** 4567",
  "failureReason": "INS-2006: Insufficient balance",
  "expiresAt": "2026-05-10T16:30:00.000Z",
  "paidAt": null,
  "completedAt": null,
  "createdAt": "2026-05-10T16:00:01.000Z",
  "updatedAt": "2026-05-10T16:00:09.000Z"
}
```

---

## 4. Request DTOs

### `BookingCreateRequest` — `POST /v1/bookings`

```ts
interface BookingCreateRequest {
  courtId: string;
  startAt: string;            // ISO-8601 UTC
  endAt: string;              // ISO-8601 UTC
  phone: string;              // MSISDN moçambicano

  paymentMethod?: PaymentMethod;       // default 'MPESA'
  participantUserIds?: string[];        // até 20
  inviteEmails?: string[];              // até 20
}
```

Exemplo:

```json
{
  "courtId": "f3a2b1c0-1234-5678-9abc-def012345678",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt":   "2026-05-10T17:00:00.000Z",
  "phone":   "258841234567",
  "paymentMethod": "MPESA",
  "participantUserIds": ["uuid-amigo-1"],
  "inviteEmails": ["amigo2@example.com"]
}
```

Validação do `phone` (qualquer destes formatos é aceite — backend normaliza):
- `841234567`
- `+258841234567`
- `258841234567`
- `+258 84 123 4567`

Operadoras válidas: prefixos `82`, `83`, `84`, `85`, `86`, `87`.

### `BookingAdminCreateRequest` — `POST /v1/admin/booking`

```ts
interface BookingAdminCreateRequest {
  userId: string;             // organizador da reserva
  courtId: string;
  startAt: string;
  endAt: string;
  phone: string;

  paymentMethod?: PaymentMethod;
  participantUserIds?: string[];
  inviteEmails?: string[];
}
```

Exemplo:

```json
{
  "userId":  "9c8d7e6f-1234-5678-9abc-def012345678",
  "courtId": "f3a2b1c0-1234-5678-9abc-def012345678",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt":   "2026-05-10T17:00:00.000Z",
  "phone":   "258841234567",
  "paymentMethod": "MPESA"
}
```

---

## 5. `Booking` (final, depois de `COMPLETED`)

Devolvido por `GET /v1/bookings/:id`, `GET /v1/bookings/me`,
`GET /v1/admin/booking`, `GET /v1/admin/booking/:id`,
`POST /v1/bookings/:id/cancel`, `POST /v1/bookings/:id/checkin`, etc.

```ts
interface Booking {
  id: string;
  courtId: string;
  organizerId: string;

  startAt: string;
  endAt: string;
  durationMinutes: number;

  totalPrice: number;
  paidAmount: number;
  currency: string;

  status: BookingStatus;       // 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'
  paymentDueAt: string | null; // legacy, normalmente null
  checkedInAt: string | null;

  participants: BookingParticipant[];
  statusHistory: BookingStatusHistory[];
  payments: BookingPayment[];

  createdAt: string;
  updatedAt: string;
}

interface BookingParticipant {
  userId: string;
  status: ParticipantStatus;
  isOrganizer: boolean;
}

interface BookingStatusHistory {
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  reason: string | null;
  createdAt: string;
}

interface BookingPayment {
  id: string;
  type: PaymentType;
  status: PaymentStatus;

  amount: number;
  currency: string;
  reference: string;

  method: PaymentMethod | null;
  phone: string | null;

  providerTransactionId: string | null; // M-Pesa TransactionID
  providerStatusCode: string | null;     // ex. "INS-0"
  providerMessage: string | null;        // ex. "Request processed successfully"
  confirmedByUserId: string | null;      // null neste fluxo
  processedAt: string | null;
}
```

### Exemplo de booking confirmado

```json
{
  "id": "9c8d7e6f-1234-5678-9abc-def012345678",
  "courtId": "f3a2b1c0-1234-5678-9abc-def012345678",
  "organizerId": "user-uuid",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt":   "2026-05-10T17:00:00.000Z",
  "durationMinutes": 60,
  "totalPrice": 500,
  "paidAmount": 500,
  "currency": "MZN",
  "status": "CONFIRMED",
  "paymentDueAt": null,
  "checkedInAt": null,
  "participants": [
    { "userId": "user-uuid", "status": "ACCEPTED", "isOrganizer": true }
  ],
  "statusHistory": [
    {
      "fromStatus": null,
      "toStatus": "CONFIRMED",
      "reason": "payment confirmed via MPESA",
      "createdAt": "2026-05-10T16:00:08.000Z"
    }
  ],
  "payments": [
    {
      "id": "payment-uuid",
      "type": "BOOKING",
      "status": "COMPLETED",
      "amount": 500,
      "currency": "MZN",
      "reference": "PAY-AB12CD34",
      "method": "MPESA",
      "phone": "258841234567",
      "providerTransactionId": "T0123456789",
      "providerStatusCode": "INS-0",
      "providerMessage": "Request processed successfully",
      "confirmedByUserId": null,
      "processedAt": "2026-05-10T16:00:08.000Z"
    }
  ],
  "createdAt": "2026-05-10T16:00:08.000Z",
  "updatedAt": "2026-05-10T16:00:08.000Z"
}
```

---

## 6. Inventário de endpoints

### Públicos (utilizador autenticado)

| Método | Path | Body | Returns |
| --- | --- | --- | --- |
| `POST` | `/v1/bookings` | `BookingCreateRequest` | `BookingCheckoutSession` (status `OPEN`) |
| `GET`  | `/v1/bookings/checkout/:sessionId` | — | `BookingCheckoutSession` |
| `GET`  | `/v1/bookings/me?page&pageSize&status` | — | `ApiPaginatedData<Booking>` |
| `GET`  | `/v1/bookings/:id` | — | `Booking` |
| `POST` | `/v1/bookings/:id/cancel` | `{ reason?: string }` | `Booking` |
| `POST` | `/v1/bookings/:id/checkin` | — | `Booking` |

### Admin / Employee

| Método | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET`  | `/v1/admin/booking?page&pageSize&status&courtId&userId` | — | `ApiPaginatedData<Booking>` |
| `GET`  | `/v1/admin/booking/:id` | — | `Booking` |
| `POST` | `/v1/admin/booking` | `BookingAdminCreateRequest` | `BookingCheckoutSession` (status `OPEN`) |
| `GET`  | `/v1/admin/booking/checkout/:sessionId` | — | `BookingCheckoutSession` |
| `POST` | `/v1/admin/booking/:id/cancel` | `{ reason?: string }` | `Booking` |
| `POST` | `/v1/admin/booking/:id/check-in` | — | `Booking` |

---

## 7. Erros (mensagens i18n)

| HTTP | Key | Quando |
| --- | --- | --- |
| 400 | `payment.error.invalidPhone` | MSISDN inválido (operadoras 82-87) |
| 400 | `payment.error.unsupportedMethod` | `paymentMethod` ≠ `MPESA` |
| 400 | `payment.error.gatewayUnavailable` | M-Pesa offline ou backend sem credenciais |
| 400 | `booking.error.invalid` | Estado inválido (ex.: check-in sobre booking não confirmado) |
| 400 | `booking.error.invalidTimeRange` | `startAt` / `endAt` inválidos |
| 403 | `auth.error.forbidden` | A tentar ver session/booking de outro user (e não é admin) |
| 403 | `user.error.userSuspended` | Admin a criar checkout para user suspenso |
| 404 | `booking.error.notFound` | bookingId desconhecido |
| 404 | `booking.error.checkoutSessionNotFound` | sessionId desconhecido |
| 404 | `user.error.userNotFound` | Admin envia `userId` inexistente |
| 409 | `booking.error.conflict` | Slot já está bloqueado por booking confirmado **ou** session OPEN/FINALIZING viva |

Estes status secundários **não são erros HTTP** — chegam via polling:

| `session.status` | `failureReason` típico |
| --- | --- |
| `PAYMENT_FAILED` | `"INS-2006: Insufficient balance"`, `"INS-9: Request timeout"`, `"INS-1: Internal error"` |
| `EXPIRED` | `"session timeout"` |

---

## 8. Códigos de resposta do M-Pesa

Aparecem em `session.failureReason` (depois dos dois pontos) e em
`booking.payments[0].providerStatusCode`.

| Código | Significado | UX sugerida |
| --- | --- | --- |
| `INS-0` | Sucesso | — (não vai para o front via failureReason) |
| `INS-1` | Erro interno do M-Pesa | "Erro temporário no M-Pesa, tente de novo" |
| `INS-5` | Transação cancelada pelo cliente | "Pagamento cancelado no telemóvel" |
| `INS-6` | Transação falhou | "Pagamento falhou, tente de novo" |
| `INS-9` | Timeout | "Não confirmaste a tempo, tente de novo" |
| `INS-10` | Transação duplicada | "Pagamento duplicado" |
| `INS-2006` | Saldo insuficiente | "Saldo M-Pesa insuficiente" |
| `INS-2051` | MSISDN inválido | "Número M-Pesa inválido" |
| `GATEWAY_ERROR` | Falha na comunicação com o gateway (não veio do M-Pesa) | "Pagamentos temporariamente indisponíveis" |
| `INVALID_PHONE` | Phone vazio na hora do charge | "Número não disponível" |

---

## 9. Estratégia de polling (recap)

```ts
function pollIntervalForCheckout(session: BookingCheckoutSession | undefined) {
  if (!session) return 3000;
  if (['COMPLETED', 'PAYMENT_FAILED', 'EXPIRED'].includes(session.status)) {
    return false; // pára
  }
  const elapsed = Date.now() - new Date(session.createdAt).getTime();
  if (elapsed < 30_000)  return 3000;   // 0-30s   → 3s
  if (elapsed < 120_000) return 5000;   // 30s-2min → 5s
  return 10000;                          // depois   → 10s
}
```

Quando `status === 'COMPLETED'`, parar o polling, invalidar
`['my-bookings']` e `['booking', session.bookingId]`, e navegar para
`/bookings/:bookingId`.

---

## 10. Tipos prontos a colar (TypeScript)

Bloco completo, copy-paste para `src/types/api.ts` do frontend:

```ts
// ---------- enums ----------
export type BookingCheckoutSessionStatus =
  | 'OPEN'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'PAYMENT_FAILED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
export type ParticipantStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REMOVED';
export type PaymentMethod = 'MPESA' | 'EMOLA' | 'CARD' | 'CASH';
export type PaymentStatus =
  | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type PaymentType = 'BOOKING' | 'REFUND' | 'PENALTY' | 'OTHER';

// ---------- API wrapper ----------
export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  timestamp: string;
  data: T;
}

export interface ApiPaginatedData<T> {
  items: T[];
  metadata: {
    currentPage: number;
    itemsPerPage: number;
    totalItems: number;
    totalPages: number;
  };
}

// ---------- requests ----------
export interface BookingCreateRequest {
  courtId: string;
  startAt: string;
  endAt: string;
  phone: string;
  paymentMethod?: PaymentMethod;
  participantUserIds?: string[];
  inviteEmails?: string[];
}

export interface BookingAdminCreateRequest extends BookingCreateRequest {
  userId: string;
}

export interface BookingCancelRequest {
  reason?: string;
}

// ---------- responses ----------
export interface BookingCheckoutSession {
  id: string;
  status: BookingCheckoutSessionStatus;
  bookingId: string | null;
  organizerId: string;
  courtId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  amount: number;
  currency: string;
  reference: string;
  paymentMethod: PaymentMethod | null;
  phone: string | null;          // mascarado
  failureReason: string | null;
  expiresAt: string;
  paidAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingParticipant {
  userId: string;
  status: ParticipantStatus;
  isOrganizer: boolean;
}

export interface BookingStatusHistory {
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  reason: string | null;
  createdAt: string;
}

export interface BookingPayment {
  id: string;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;
  currency: string;
  reference: string;
  method: PaymentMethod | null;
  phone: string | null;
  providerTransactionId: string | null;
  providerStatusCode: string | null;
  providerMessage: string | null;
  confirmedByUserId: string | null;
  processedAt: string | null;
}

export interface Booking {
  id: string;
  courtId: string;
  organizerId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  totalPrice: number;
  paidAmount: number;
  currency: string;
  status: BookingStatus;
  paymentDueAt: string | null;
  checkedInAt: string | null;
  participants: BookingParticipant[];
  statusHistory: BookingStatusHistory[];
  payments: BookingPayment[];
  createdAt: string;
  updatedAt: string;
}

// ---------- helpers ----------
export const SESSION_TERMINAL_STATES: BookingCheckoutSessionStatus[] = [
  'COMPLETED',
  'PAYMENT_FAILED',
  'EXPIRED',
];

export const isSessionTerminal = (s: BookingCheckoutSessionStatus): boolean =>
  SESSION_TERMINAL_STATES.includes(s);
```

---

## 11. Notificações automáticas (server-side)

O frontend **não precisa fazer nada** para disparar estas notificações. O
backend envia push (Expo) + email (Resend) automaticamente, respeitando
`user.notifyPush` e `user.notifyEmail`.

| Evento | Trigger | Audiência |
| --- | --- | --- |
| `notifyCheckoutCreatedByAdmin` | Admin chama `POST /v1/admin/booking` | Organizador da session |
| `notifyPaymentConfirmed` | M-Pesa devolve `INS-0` e o booking nasce | Organizador do booking |
| `notifyCheckoutFailed` | M-Pesa recusa o débito | Organizador da session |
| `notifyCheckoutExpired` | Cron marca session como `EXPIRED` | Organizador da session |
| `notifyBookingCancelledByAdmin` | Admin cancela booking | Organizador do booking |
| `notifyCheckIn` | Check-in confirmado | Organizador do booking |

Os pushes incluem `data.type` (`booking` ou `checkoutSession`) e o ID
correspondente, para deep-linking direto no app móvel.
