# Prompt para IA do Frontend — Migração para Pagamento M-Pesa

> Substitui completamente o fluxo `booking_manual_payment_confirmation`
> documentado em [front-ai-booking-manual-payment.md](./front-ai-booking-manual-payment.md).
> Esse documento ficou **obsoleto** — as rotas e os campos abaixo deixaram de existir.

## Contexto da mudança

O backend deixou de depender de um operador humano para confirmar pagamentos.
Agora o débito é iniciado automaticamente contra o gateway **M-Pesa (Vodacom Moçambique)**
imediatamente após a criação da reserva. A reserva só fica `CONFIRMED` se o gateway
aceitar; caso contrário é `CANCELLED` automaticamente.

**Regra de negócio nova:** primeiro paga, depois agenda. Não há mais reservas que
ficam ativas sem pagamento confirmado.

Provider abstraction no backend já está em vigor: hoje só `MPESA` é suportado;
`EMOLA` e `CARD` ficam para o futuro e são rejeitados com
`payment.error.unsupportedMethod`.

---

## O que mudou na API

### Removido (NÃO usar mais)

| Antes | Depois |
| --- | --- |
| `POST /v1/admin/booking/:id/confirm-payment` | **REMOVIDO** — não há confirmação manual |
| Body `{ confirmPaymentNow, method }` no `POST /v1/admin/booking` | **REMOVIDO** — substituído por `phone` + `paymentMethod` |
| `BookingPaymentConfirmRequestDto` | **REMOVIDO** |
| `booking.error.confirmRequiresMethod` | **REMOVIDO** |

### Alterado

| Endpoint | Mudança |
| --- | --- |
| `POST /v1/bookings` | Passa a exigir `phone` no body. Dispara M-Pesa. |
| `POST /v1/admin/booking` | Passa a exigir `phone` no body. Dispara M-Pesa. |
| `GET /v1/bookings/:id` | Resposta inclui `payments[].phone`, `payments[].providerStatusCode`, `payments[].providerMessage`, `payments[].providerTransactionId` |
| `GET /v1/payments/:id` | Idem |
| `BookingStatus` | Sem mudança nos valores, mas o significado de `PENDING` agora é "à espera do gateway" |
| `PaymentStatus` | **Novo valor: `PROCESSING`** (job M-Pesa em execução). |

---

## Novos contratos

### 1) Criar reserva (cliente final)

**Request** `POST /v1/bookings`

```json
{
  "courtId": "uuid",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt":   "2026-05-10T17:00:00.000Z",
  "phone":   "258841234567",
  "paymentMethod": "MPESA"
}
```

- `phone`: **obrigatório**. Aceita `84xxxxxxx`, `+258 84 xxx xxxx`, `25884xxxxxxx`. O backend normaliza para `258XXXXXXXXX`. Operadoras válidas: 82-87.
- `paymentMethod`: opcional (default `MPESA`). Hoje só `MPESA` é aceite.

**Response 201** — `BookingResponseDto` com:

- `status: "PENDING"`
- `payments[0].status: "PENDING"` (será `PROCESSING` em segundos, e depois `COMPLETED`/`FAILED`)
- `payments[0].phone: "258841234567"`
- `paymentDueAt`: timeout para o cron expirar caso o gateway nunca responda.

> **Importante:** o endpoint NÃO espera o M-Pesa terminar. Devolve a reserva
> imediatamente como `PENDING`. O cliente é responsável por fazer **polling**
> em `GET /v1/bookings/:id` (ou `/v1/bookings/me`) para obter o estado final.

### 2) Criar reserva (admin / employee)

**Request** `POST /v1/admin/booking`

```json
{
  "userId":  "uuid",
  "courtId": "uuid",
  "startAt": "2026-05-10T16:00:00.000Z",
  "endAt":   "2026-05-10T17:00:00.000Z",
  "phone":   "258841234567",
  "paymentMethod": "MPESA"
}
```

- `phone`: **obrigatório**. Número do cliente que vai receber o pedido de PIN do M-Pesa.
- `paymentMethod`: opcional (default `MPESA`).

**Response 201** — idêntica ao público; reserva nasce `PENDING` e o débito M-Pesa é disparado em background.

### 3) Polling do estado

`GET /v1/bookings/:id` — sugere-se polling com backoff:

- intervalo inicial: 3s
- após 30s: 5s
- após 2min: 10s
- desistir após `paymentDueAt` (se a resposta não tiver `paymentDueAt`, parar aos 5min)

Estado a observar em `payments[0].status`:

| status | Significado | UX |
| --- | --- | --- |
| `PENDING` | Job M-Pesa enfileirado, ainda não disparou | "A iniciar pagamento…" |
| `PROCESSING` | Cliente recebeu o pedido de PIN no telemóvel | "Aguarde — confirme no telemóvel com PIN" |
| `COMPLETED` | M-Pesa aceitou | Reserva fica `CONFIRMED` |
| `FAILED` | M-Pesa recusou | Reserva fica `CANCELLED`. Mostrar `providerMessage` |
| `CANCELLED` | Cancelado por timeout/admin/utilizador | — |

E em `booking.status`:

- `PENDING` → ainda no processo de pagamento
- `CONFIRMED` → pago e agendado (final feliz)
- `CANCELLED` → falhou ou expirou (mostrar motivo de `cancellationReason`)

### 4) Campos novos no payload do payment

```json
{
  "id": "uuid",
  "status": "FAILED",
  "method": "MPESA",
  "phone": "258841234567",
  "providerTransactionId": "ABC123XYZ",
  "providerStatusCode": "INS-9",
  "providerMessage": "Request timeout",
  "amount": 500,
  "currency": "MZN"
}
```

- `providerStatusCode`: códigos `INS-*` do M-Pesa. `INS-0` = sucesso. Qualquer outro = falha.
- `providerMessage`: texto humanamente legível devolvido pelo gateway. Mostrar ao utilizador em caso de falha.
- `providerTransactionId`: id do M-Pesa (útil para reconciliação no painel).

---

## Endpoints que continuam iguais

- `GET /v1/bookings/me`
- `GET /v1/bookings/:id`
- `POST /v1/bookings/:id/cancel`
- `POST /v1/bookings/:id/checkin`
- `GET /v1/admin/booking`
- `GET /v1/admin/booking/:id`
- `POST /v1/admin/booking/:id/cancel`
- `POST /v1/admin/booking/:id/check-in`
- `GET /v1/payments`
- `GET /v1/payments/:id`

---

## Tratamento de erros novos

### 400 Bad Request

| Mensagem | Causa | UX |
| --- | --- | --- |
| `payment.error.invalidPhone` | Número não é MSISDN moçambicano válido | Marcar campo phone como inválido. Ex.: "Número inválido. Use formato 84xxxxxxx ou 258 84xxxxxxx" |
| `payment.error.unsupportedMethod` | Front mandou `paymentMethod` diferente de `MPESA` | Mostrar "Método ainda não suportado" |
| `payment.error.gatewayUnavailable` | Backend sem credenciais ou M-Pesa offline | "Pagamentos temporariamente indisponíveis, tente novamente" |

### Estados intermédios sem erro HTTP

A reserva ficar `CANCELLED` com `cancellationReason: "payment failed: ..."` **não é um erro HTTP**. Tratar via polling do estado, não por exception.

---

## Fluxos a implementar no frontend

### Fluxo A — App cliente

1. Utilizador seleciona court + horário.
2. Front pede o **número de telemóvel** (default = `user.phone` se já estiver guardado, mas editável).
3. `POST /v1/bookings` com `{ courtId, startAt, endAt, phone, paymentMethod: "MPESA" }`.
4. Mostrar ecrã "Confirme no telemóvel com PIN" com:
   - Spinner / countdown até `paymentDueAt`
   - Texto: "Foi enviada uma notificação para `258 84 *** **67`. Insere o PIN para concluir."
5. Polling de `GET /v1/bookings/:id` a cada 3-5s.
6. Resolver para um de:
   - `status=CONFIRMED` → ecrã de sucesso, redirecionar para "Minhas Reservas"
   - `status=CANCELLED` → ecrã de falha com `payments[0].providerMessage` + botão "Tentar de novo" (refazer o `POST /v1/bookings`)
   - timeout do polling → mostrar "Demorou mais que o esperado, verifica em Minhas Reservas"

### Fluxo B — Painel admin/employee

1. Admin abre "Nova Reserva".
2. Seleciona utilizador, court, horário.
3. Preenche **número de telemóvel** do cliente (campo novo obrigatório, pré-preenchido com o phone do utilizador se existir).
4. `POST /v1/admin/booking` com `{ userId, courtId, startAt, endAt, phone, paymentMethod: "MPESA" }`.
5. Listagem de reservas mostra o estado do pagamento em tempo (quase) real:
   - badge `PENDING` (amarelo) → "A iniciar"
   - badge `PROCESSING` (azul) → "Cliente a confirmar"
   - badge `COMPLETED` (verde) → "Pago"
   - badge `FAILED` (vermelho) → "Falhou: <providerMessage>"

### Fluxo C — Reservas existentes em PENDING (legacy)

Reservas criadas antes desta migração que ainda estejam em `PENDING` **não vão ser
debitadas automaticamente**. O cron de `expirePendingBookings` vai cancelá-las
ao chegar o `paymentDueAt`. O front não precisa fazer nada especial.

---

## Componentes UI a criar/atualizar

- **Input de telemóvel moçambicano**: máscara `+258 8X XXX XXXX`, validação client-side com regex `^\+?258\s?8[2-7]\s?\d{3}\s?\d{4}$|^8[2-7]\d{7}$`.
- **Badge de PaymentStatus** com o novo valor `PROCESSING`.
- **Modal "Aguardando pagamento M-Pesa"** com countdown e instrução para o utilizador inserir o PIN no telemóvel.
- **Tela de falha** que renderiza `providerMessage` quando existir.

---

## Mutations / queries (React Query)

### Removidas

- ~~`useConfirmBookingPaymentMutation`~~ — endpoint deixou de existir.

### Adicionadas/alteradas

- `useCreateBookingMutation()` → body inclui `phone` e `paymentMethod`.
- `useCreateAdminBookingMutation()` → body inclui `phone` e `paymentMethod` (sem `confirmPaymentNow`/`method`).
- `useBookingPollingQuery(id)` → hook dedicado para polling de detalhes de booking enquanto o pagamento está em curso (refetchInterval dinâmico, parar quando `status` for terminal).

### Invalidação após criar booking

- `my-bookings`
- `admin-bookings` (se aplicável)
- O hook de polling encarrega-se de invalidar `booking-details:{id}` ao mudar de estado.

---

## Critérios de aceite

- Não existe nenhuma chamada a `POST /v1/admin/booking/:id/confirm-payment` no código do front.
- O input de número de telemóvel é obrigatório em **ambos** os formulários (público e admin) e valida operadora moçambicana.
- O front trata o estado `PROCESSING` com UX explícita ("confirme com PIN no telemóvel").
- Quando o pagamento falha, o utilizador vê a `providerMessage` retornada pelo gateway e tem opção de retry (criar nova reserva).
- A reserva só aparece como confirmada depois de `payments[0].status === "COMPLETED"` e `booking.status === "CONFIRMED"`.
- Reservas com `status=CANCELLED` por falha de pagamento mostram `cancellationReason` ao utilizador.
