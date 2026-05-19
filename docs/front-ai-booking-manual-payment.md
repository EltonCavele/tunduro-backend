# Prompt para IA do Frontend

Implementar no frontend (web/admin + app) o fluxo `booking_manual_payment_confirmation` com as regras abaixo.

## Contexto do negócio

- O gateway Paysuite foi removido.
- A reserva agora é criada diretamente com status `PENDING`.
- O pagamento é confirmado manualmente no painel por utilizadores com role `ADMIN` ou `EMPLOYEE`.
- A confirmação precisa registrar:
  - método de pagamento (`MPESA`, `EMOLA`, `CASH`, `CARD`)
  - utilizador que confirmou (`confirmedByUserId`, vindo do backend)
- Reservas `PENDING` expiram por timeout no backend e passam para `CANCELLED`.

## Objetivo de implementação (frontend)

<!-- 1. Permitir criação de booking pendente no app cliente. -->
2. No painel admin/employee, permitir:
   - listar e filtrar reservas
   - confirmar pagamento de reservas pendentes
   - criar reserva já confirmada (fast-path)
3. Exibir estado e histórico de pagamento de forma clara.
4. Tratar erros por status HTTP com UX consistente.

---

## Endpoints a consumir

<!-- ### Público

- `POST /v1/bookings`
- `GET /v1/bookings/me`
- `GET /v1/bookings/:id`
- `POST /v1/bookings/:id/cancel`
- `POST /v1/bookings/:id/checkin` -->

### Painel Admin/Employee

- `GET /v1/admin/booking`
- `GET /v1/admin/booking/:id`
- `POST /v1/admin/booking`
- `POST /v1/admin/booking/:id/confirm-payment`
- `POST /v1/admin/booking/:id/cancel`
- `POST /v1/admin/booking/:id/check-in`

### Pagamentos

- `GET /v1/payments`
- `GET /v1/payments/:id`

---

## Contratos principais

<!-- ### 1) Criar booking pendente (app)

**Request** `POST /v1/bookings`

```json
{
  "courtId": "uuid",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt": "2026-05-10T17:00:00.000Z"
}
```

**Resposta**: `BookingResponseDto` com `status = PENDING`, `paymentDueAt` preenchido e `payments` com transação `PENDING`. -->

### 2) Criar booking no painel (com fast-path opcional)

**Request** `POST /v1/admin/booking`

```json
{
  "userId": "uuid",
  "courtId": "uuid",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt": "2026-05-10T17:00:00.000Z",
  "confirmPaymentNow": true,
  "method": "CASH"
}
```

Regras:
- Se `confirmPaymentNow = true`, `method` é obrigatório.
- Se `confirmPaymentNow = false` (ou ausente), booking fica `PENDING`.

### 3) Confirmar pagamento manual (painel)

**Request** `POST /v1/admin/booking/:id/confirm-payment`

```json
{
  "method": "MPESA",
  "reference": "MPSA-12345",
  "note": "Pago no balcão"
}
```

Efeito esperado:
- booking `PENDING -> CONFIRMED`
- payment `PENDING -> COMPLETED`
- preencher `method` e `confirmedByUserId`

---

## States de UI

### Booking status badge

- `PENDING`: “Aguardando confirmação de pagamento”
- `CONFIRMED`: “Pagamento confirmado”
- `CANCELLED`: “Cancelada”
- `COMPLETED`: “Concluída”
- `NO_SHOW`: “No-show”

### Payment status badge (dentro de booking/payments)

- `PENDING`
- `COMPLETED`
- `CANCELLED`
- `FAILED`
- `REFUNDED`

### Método de pagamento

Mostrar `method` quando existir:
- `MPESA`, `EMOLA`, `CASH`, `CARD`

---

## Queries e mutations (React Query sugestão)

> Ajustar nomes conforme arquitetura do teu front.

### Queries

- `useMyBookingsQuery(params)` -> `GET /v1/bookings/me`
- `useBookingDetailsQuery(id)` -> `GET /v1/bookings/:id`
- `useAdminBookingsQuery(params)` -> `GET /v1/admin/booking`
- `useAdminBookingDetailsQuery(id)` -> `GET /v1/admin/booking/:id`
- `usePaymentsQuery(params)` -> `GET /v1/payments`
- `usePaymentByIdQuery(id)` -> `GET /v1/payments/:id`

### Mutations

- `useCreateBookingMutation()` -> `POST /v1/bookings`
- `useCreateAdminBookingMutation()` -> `POST /v1/admin/booking`
- `useConfirmBookingPaymentMutation()` -> `POST /v1/admin/booking/:id/confirm-payment`
- `useCancelBookingMutation()` -> `POST /v1/bookings/:id/cancel`
- `useAdminCancelBookingMutation()` -> `POST /v1/admin/booking/:id/cancel`
- `useCheckInMutation()` -> `POST /v1/bookings/:id/checkin`
- `useAdminCheckInMutation()` -> `POST /v1/admin/booking/:id/check-in`

### Invalidação de cache (após mutações)

Após confirmar pagamento:
- invalidar `admin-bookings`
- invalidar `admin-booking-details:{id}`
- invalidar `payments`
- invalidar `payment-by-id` (se aberto)

Após criar booking:
- invalidar `my-bookings` (app)
- invalidar `admin-bookings` (se painel também estiver ativo)

---

## Tratamento de erros por status HTTP

### 400 Bad Request

Causas comuns:
- `booking.error.invalidStatusForConfirmation`
- `booking.error.confirmRequiresMethod`

UX:
- toast de erro com mensagem funcional
- não redirecionar

### 401 Unauthorized

UX:
- limpar sessão local
- redirecionar para login

### 403 Forbidden

Causas comuns:
- role sem permissão para confirmar pagamento

UX:
- toast “Sem permissão”
- esconder/disable ações de confirmar quando role não for `ADMIN|EMPLOYEE`

### 404 Not Found

Causas comuns:
- booking ou payment não encontrado

UX:
- toast + fallback “registro não encontrado”
- remover item da tela se estava em lista

### 409 Conflict

Causa comum:
- `booking.error.conflict` (slot indisponível)

UX:
- informar “horário não disponível”
- sugerir reabrir seletor de horário

### 5xx

UX:
- mensagem genérica “Falha no servidor, tente novamente”
- manter botão de retry

---

## Regras de UI por role

### ADMIN

- acesso total ao painel de bookings e pagamentos
- pode confirmar pagamento

### EMPLOYEE

- mesmo acesso de painel para bookings/pagamentos necessários ao processo
- pode confirmar pagamento
- não mostrar labels de “super admin” nem ações destrutivas globais fora do escopo (se existirem no front)

<!-- ### USER

- não pode acessar rotas admin
- apenas ver/gerir próprias reservas -->

---

## Fluxos que a IA deve implementar

<!-- ### Fluxo A - App cliente (criação pendente)

1. Usuário seleciona court/horário.
2. Chama `POST /v1/bookings`.
3. UI mostra booking como `PENDING` com contador/aviso de prazo (`paymentDueAt`).
4. Tela de detalhe deve atualizar status automaticamente (polling leve ou refetch ao focar). -->

### Fluxo B - Painel (confirmar pagamento)

1. Admin/Employee abre lista de bookings pendentes.
2. Abre detalhe da reserva.
3. Seleciona método (`MPESA|EMOLA|CASH|CARD`) e opcionalmente `reference` + `note`.
4. Chama `POST /v1/admin/booking/:id/confirm-payment`.
5. Em sucesso:
   - atualizar status para `CONFIRMED`
   - exibir `confirmedByUserId` e `method`
   - feedback visual de sucesso

### Fluxo C - Painel fast-path

1. Admin/Employee cria reserva para cliente.
2. Se marcou `confirmPaymentNow`, enviar `method` obrigatório.
3. Reserva nasce `CONFIRMED` e pagamento `COMPLETED`.

---

## Critérios de aceite

- Nenhuma chamada ao Paysuite permanece no frontend.
- Botão “Confirmar pagamento” aparece apenas para `ADMIN|EMPLOYEE`.
- Booking criado no app entra como `PENDING`.
- Confirmação manual muda booking para `CONFIRMED` e payment para `COMPLETED`.
- Método de pagamento e confirmador aparecem em detalhe/lista quando disponíveis.
- Tratamento de erro por HTTP está implementado e consistente.

