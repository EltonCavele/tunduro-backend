# Fluxo Mobile — Reserva de Court com M-Pesa

> Documento de implementação para o **app mobile (React Native + Expo)**.
> Para a referência completa de tipos/contratos, vê
> [front-ai-booking-mpesa-structures.md](./front-ai-booking-mpesa-structures.md).
> Para o "porquê" arquitectural, vê
> [front-ai-booking-mpesa-migration.md](./front-ai-booking-mpesa-migration.md).

---

## 1. Princípio do fluxo

> **Primeiro paga, depois agenda.**
> O `Booking` só nasce **depois** do M-Pesa confirmar o débito.
> Antes disso, existe apenas uma **`BookingCheckoutSession`** que segura o slot.

```
[1] User escolhe court + horário + telemóvel
        ↓
[2] App: POST /v1/bookings { courtId, startAt, endAt, phone }
        ↓
[3] Server devolve session OPEN (em < 1s)
        ↓
[4] App entra em ecrã "Aguardando M-Pesa"
        ↓
[5] User recebe popup no telemóvel → digita PIN
        ↓
[6] App faz polling em GET /v1/bookings/checkout/:sessionId
        ↓
   ┌────────────┴────────────┐
   ↓                         ↓
COMPLETED              PAYMENT_FAILED / EXPIRED
   ↓                         ↓
GET /bookings/:bookingId   Mostrar erro + retry
Tela de sucesso
```

---

## 2. Mapa de ecrãs

```
NewBookingScreen
   │
   ├─ Step 1: CourtSelection      (lista cards de courts)
   ├─ Step 2: SlotPicker          (date + time)
   ├─ Step 3: ReviewScreen        (resumo + phone input + CTA "Pagar com M-Pesa")
   │
   ↓ POST /v1/bookings
   │
CheckoutWaitingScreen             ← polling activo
   │
   ├─ status=OPEN | FINALIZING    "A processar... confirme o PIN no telemóvel"
   ├─ status=COMPLETED            ✓ → BookingSuccessScreen
   ├─ status=PAYMENT_FAILED       ✗ → CheckoutFailedScreen (com retry)
   └─ status=EXPIRED              ⏱ → CheckoutExpiredScreen (com retry)
```

---

## 3. Step 3: `ReviewScreen` — input do telemóvel

### Validação client-side

```ts
const MOZ_MSISDN_REGEX =
  /^(\+?258)?\s?(8[2-7])\s?\d{3}\s?\d{4}$|^(8[2-7])\d{7}$/;

function validateMozPhone(value: string): boolean {
  return MOZ_MSISDN_REGEX.test(value.trim());
}
```

Aceita: `841234567`, `84 123 4567`, `+258 84 123 4567`, `258 84 123 4567`.
Rejeita: outros prefixos (só `82-87` são M-Pesa/Vodacom).

### Componente de input

```tsx
import { TextInput } from 'react-native';

function PhoneInput({ value, onChange, error }: Props) {
  return (
    <View>
      <Text>Número M-Pesa</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="84 123 4567"
        keyboardType="phone-pad"
        maxLength={15}
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      {error && <Text style={{ color: 'red' }}>{error}</Text>}
      <Text style={{ color: '#666', fontSize: 12 }}>
        Vodacom Moçambique. Vais receber um pedido de PIN no telemóvel.
      </Text>
    </View>
  );
}
```

Pré-preencher com `user.phone` se existir, mas deixar editar (alguém pode reservar com o telemóvel de outra pessoa que paga).

### Botão "Pagar com M-Pesa"

```tsx
<Button
  title={`Pagar ${formatMZN(total)}`}
  disabled={!validateMozPhone(phone) || createMutation.isPending}
  loading={createMutation.isPending}
  onPress={() => createMutation.mutate({ courtId, startAt, endAt, phone })}
/>
```

`createMutation.isPending` cobre só os ~500ms-1s de criar a session. Não usar para esperar o M-Pesa — isso é o ecrã seguinte.

---

## 4. Hook de criação

```ts
import { useMutation } from '@tanstack/react-query';

export function useCreateCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: BookingCreateRequest) => {
      const { data } = await api.post<ApiResponse<BookingCheckoutSession>>(
        '/v1/bookings',
        body
      );
      return data.data;
    },
    onSuccess: (session) => {
      // Pré-popula o cache para o polling arrancar com algo
      queryClient.setQueryData(['checkout', session.id], session);
      // Navegar IMEDIATAMENTE — não esperar mais nada
      router.replace({
        pathname: '/checkout/[sessionId]',
        params: { sessionId: session.id },
      });
    },
    onError: (error: ApiError) => {
      // Erros possíveis: 400 invalidPhone, 409 conflict, 503 gatewayUnavailable
      Toast.error(translateApiError(error));
    },
  });
}
```

---

## 5. `CheckoutWaitingScreen` — polling

Este é o ecrã onde 90% da magia acontece. O user fica aqui ~10-30s à espera do popup do M-Pesa.

### Hook de polling com backoff

```ts
import { useQuery } from '@tanstack/react-query';

const TERMINAL_STATES = new Set<BookingCheckoutSessionStatus>([
  'COMPLETED',
  'PAYMENT_FAILED',
  'EXPIRED',
]);

function pollIntervalForCheckout(
  session: BookingCheckoutSession | undefined
): number | false {
  if (!session) return 3000;
  if (TERMINAL_STATES.has(session.status)) return false;
  const elapsed = Date.now() - new Date(session.createdAt).getTime();
  if (elapsed < 30_000)  return 3_000;   // 0-30s   → 3s
  if (elapsed < 120_000) return 5_000;   // 30s-2min → 5s
  return 10_000;                          // depois   → 10s
}

export function useCheckoutPolling(sessionId: string | null) {
  return useQuery({
    queryKey: ['checkout', sessionId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<BookingCheckoutSession>>(
        `/v1/bookings/checkout/${sessionId}`
      );
      return data.data;
    },
    enabled: Boolean(sessionId),
    refetchInterval: (query) => pollIntervalForCheckout(query.state.data),
    refetchIntervalInBackground: false,  // não polling se app em background
    staleTime: 0,
    gcTime: 60_000,
  });
}
```

### Ecrã

```tsx
export function CheckoutWaitingScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { data: session, error } = useCheckoutPolling(sessionId);
  const queryClient = useQueryClient();

  // Dispatch para o estado terminal
  useEffect(() => {
    if (!session) return;

    if (session.status === 'COMPLETED' && session.bookingId) {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', session.bookingId] });
      router.replace({
        pathname: '/booking/[id]/success',
        params: { id: session.bookingId },
      });
    } else if (session.status === 'PAYMENT_FAILED') {
      router.replace({
        pathname: '/checkout/failed',
        params: {
          sessionId: session.id,
          reason: session.failureReason ?? '',
        },
      });
    } else if (session.status === 'EXPIRED') {
      router.replace({ pathname: '/checkout/expired' });
    }
  }, [session?.status, session?.bookingId]);

  // Loading inicial
  if (!session) return <FullScreenLoader />;

  // Estado activo: OPEN ou FINALIZING
  return (
    <View style={styles.container}>
      <PulseIcon />

      <Text style={styles.title}>Confirme o pagamento</Text>
      <Text style={styles.subtitle}>
        Foi enviada uma notificação para{' '}
        <Text style={{ fontWeight: 'bold' }}>{session.phone}</Text>.
        Insira o seu PIN M-Pesa para concluir.
      </Text>

      <ExpiryCountdown expiresAt={session.expiresAt} />

      <View style={styles.detailsCard}>
        <Row label="Valor" value={formatMoney(session.amount, session.currency)} />
        <Row label="Referência" value={session.reference} />
      </View>

      <View style={styles.tips}>
        <Tip icon="bell">Mantenha o telemóvel desbloqueado.</Tip>
        <Tip icon="wifi">Garanta cobertura de rede.</Tip>
        <Tip icon="key">Aceite o pedido e digite o PIN do M-Pesa.</Tip>
      </View>

      <Button
        variant="ghost"
        title="Cancelar"
        onPress={() => {
          // Não há cancelar server-side; apenas sai do ecrã.
          // A session expira sozinha em 30min.
          router.back();
        }}
      />
    </View>
  );
}
```

### Countdown component

```tsx
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now())
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  return (
    <Text style={{ fontVariant: ['tabular-nums'], color: '#666' }}>
      Tempo restante: {minutes}:{seconds.toString().padStart(2, '0')}
    </Text>
  );
}
```

### Anti-padrões a evitar nesse ecrã

- ❌ `Alert.alert` ou modal a bloquear UI durante o polling — o user precisa de **ver** que está a processar.
- ❌ Não chamar `router.back()` automaticamente em `EXPIRED` ou `FAILED`. Tens de ter um ecrã dedicado para o user perceber porque falhou.
- ❌ Não chamar `GET /bookings/:bookingId` enquanto `bookingId` for `null`. Só usar `bookingId` quando `status === 'COMPLETED'`.
- ❌ Não polling em background do app (já está protegido com `refetchIntervalInBackground: false`).

---

## 6. `CheckoutFailedScreen`

```tsx
export function CheckoutFailedScreen() {
  const { sessionId, reason } = useLocalSearchParams<{
    sessionId: string;
    reason: string;
  }>();

  const userMessage = mapMpesaErrorToUserMessage(reason);

  return (
    <View style={styles.container}>
      <Icon name="x-circle" color="red" size={64} />
      <Text style={styles.title}>Pagamento recusado</Text>
      <Text style={styles.error}>{userMessage}</Text>

      <Button
        title="Tentar novamente"
        onPress={() => router.replace('/booking/new')}
      />
      <Button
        variant="ghost"
        title="Voltar ao início"
        onPress={() => router.replace('/')}
      />
    </View>
  );
}

function mapMpesaErrorToUserMessage(failureReason: string): string {
  // failureReason vem como "INS-2006: Insufficient balance"
  const code = failureReason.split(':')[0]?.trim();

  switch (code) {
    case 'INS-5':
      return 'Cancelaste o pagamento no telemóvel.';
    case 'INS-6':
      return 'O pagamento falhou no M-Pesa. Tenta novamente.';
    case 'INS-9':
      return 'Não confirmaste o pagamento a tempo.';
    case 'INS-2006':
      return 'Saldo M-Pesa insuficiente.';
    case 'INS-2051':
      return 'Número M-Pesa inválido.';
    case 'INS-10':
      return 'Pagamento duplicado, tenta de novo.';
    case 'GATEWAY_ERROR':
      return 'O M-Pesa está temporariamente indisponível.';
    default:
      return failureReason || 'O pagamento falhou. Tenta novamente.';
  }
}
```

---

## 7. `CheckoutExpiredScreen`

```tsx
export function CheckoutExpiredScreen() {
  return (
    <View style={styles.container}>
      <Icon name="clock" color="#999" size={64} />
      <Text style={styles.title}>Tempo esgotado</Text>
      <Text style={styles.subtitle}>
        Não recebemos a confirmação do pagamento a tempo.
        O slot foi libertado.
      </Text>

      <Button
        title="Reservar novamente"
        onPress={() => router.replace('/booking/new')}
      />
    </View>
  );
}
```

---

## 8. `BookingSuccessScreen`

Aqui já temos `bookingId`, então fazemos um `useQuery` normal para o booking:

```tsx
export function BookingSuccessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: booking } = useBooking(id);

  if (!booking) return <FullScreenLoader />;

  return (
    <View style={styles.container}>
      <Icon name="check-circle" color="green" size={64} />
      <Text style={styles.title}>Reserva confirmada!</Text>

      <BookingDetailsCard booking={booking} />

      <Button
        title="Ver minhas reservas"
        onPress={() => router.replace('/bookings')}
      />
      <Button
        variant="ghost"
        title="Reservar outra"
        onPress={() => router.replace('/booking/new')}
      />
    </View>
  );
}

export function useBooking(bookingId: string | null) {
  return useQuery({
    queryKey: ['booking', bookingId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Booking>>(
        `/v1/bookings/${bookingId}`
      );
      return data.data;
    },
    enabled: Boolean(bookingId),
  });
}
```

---

## 9. Tratamento de erros HTTP no `POST /v1/bookings`

| HTTP | Mensagem | Quando | UX |
| --- | --- | --- | --- |
| 400 | `payment.error.invalidPhone` | Número não passa no regex servidor | Marcar campo phone, focar input. |
| 400 | `booking.error.invalid` | startAt ≥ endAt, ou duração inválida | Voltar ao step 2 (slot picker). |
| 403 | `auth.error.forbidden` | Token expirado | Triggar refresh ou login. |
| 409 | `booking.error.conflict` | Slot já tem booking confirmado **ou** session OPEN/FINALIZING activa | Toast "Este horário já não está disponível", voltar ao step 2 e refresh dos slots. |
| 503 | `payment.error.gatewayUnavailable` | Redis ou backend de pagamento offline | "Pagamentos temporariamente indisponíveis. Tenta dentro de minutos." |

```ts
function translateApiError(err: ApiError): string {
  const key = err?.response?.data?.message;
  switch (key) {
    case 'payment.error.invalidPhone':
      return 'Número M-Pesa inválido. Confere o formato (84xxxxxxx).';
    case 'booking.error.conflict':
      return 'Este horário já não está disponível.';
    case 'payment.error.gatewayUnavailable':
      return 'Pagamentos temporariamente indisponíveis. Tenta novamente.';
    default:
      return 'Algo correu mal. Tenta novamente.';
  }
}
```

---

## 10. Push notifications (deep linking)

O backend dispara push notifications automaticamente em vários momentos. Cada push inclui um `data.type` e ID — o app deve usá-los para deep-linking.

### Tipos de push

| `data.type` | Campo extra | Quando | Ecrã alvo |
| --- | --- | --- | --- |
| `checkoutSession` | `data.sessionId` | Admin criou checkout em nome do user, ou pagamento falhou, ou session expirou | `/checkout/[sessionId]` (mostra estado actual) |
| `booking` | `data.bookingId` | Pagamento confirmado, check-in confirmado, ou booking cancelado | `/booking/[id]` |

### Handler de push (Expo Notifications)

```ts
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

export function usePushDeepLinking() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as {
        type?: 'booking' | 'checkoutSession';
        bookingId?: string;
        sessionId?: string;
      };

      if (data.type === 'checkoutSession' && data.sessionId) {
        router.push({
          pathname: '/checkout/[sessionId]',
          params: { sessionId: data.sessionId },
        });
      } else if (data.type === 'booking' && data.bookingId) {
        router.push({
          pathname: '/booking/[id]',
          params: { id: data.bookingId },
        });
      }
    });

    return () => sub.remove();
  }, []);
}
```

Chamar `usePushDeepLinking()` no `_layout.tsx` raiz.

### Caso especial — admin cria checkout

Quando o admin cria um checkout em nome do user, o user recebe um push com `data.type=checkoutSession`. O app abre `/checkout/[sessionId]` — que é exactamente o mesmo ecrã que o user veria se tivesse criado a session ele próprio. **Não precisa de fluxo paralelo.**

---

## 11. Edge cases

### Caso A — User mata o app antes do M-Pesa responder

A session fica `OPEN` ou `FINALIZING`. O cron do servidor marca como `EXPIRED` ao fim de 30min. O user vai receber um push de `notifyCheckoutExpired`.

Quando o user volta ao app, ao reabrir, podes:
1. Verificar se há uma session OPEN/FINALIZING dele em `GET /v1/bookings/me?status=...` — mas como o backend não devolve sessions nessa rota, o melhor é o app guardar o `sessionId` activo em `AsyncStorage` e ao fazer cold-start verificar.

```ts
const ACTIVE_CHECKOUT_KEY = 'active_checkout_session_id';

export async function setActiveCheckout(sessionId: string) {
  await AsyncStorage.setItem(ACTIVE_CHECKOUT_KEY, sessionId);
}

export async function clearActiveCheckout() {
  await AsyncStorage.removeItem(ACTIVE_CHECKOUT_KEY);
}

export async function resumeCheckoutIfAny() {
  const id = await AsyncStorage.getItem(ACTIVE_CHECKOUT_KEY);
  if (!id) return;

  // Tenta carregar; se já estiver terminal, limpa
  try {
    const session = await fetchCheckoutSession(id);
    if (TERMINAL_STATES.has(session.status)) {
      await clearActiveCheckout();
      return;
    }
    router.push({ pathname: '/checkout/[sessionId]', params: { sessionId: id } });
  } catch {
    await clearActiveCheckout();
  }
}
```

E limpar o `AsyncStorage` no `useEffect` final do `CheckoutWaitingScreen` quando o estado for terminal.

### Caso B — User cancela o popup no telemóvel

M-Pesa devolve `INS-5` → backend marca session como `PAYMENT_FAILED` com `failureReason: "INS-5: Transaction cancelled"` → app vai para `CheckoutFailedScreen` e mostra "Cancelaste o pagamento no telemóvel".

### Caso C — User não tem cobertura

O popup nunca chega ao M-Pesa. Eventualmente o gateway devolve `INS-9: Request timeout` → `PAYMENT_FAILED`. Pode demorar até 60s.

### Caso D — Slot já foi tomado entre o step 2 e o step 3

`POST /v1/bookings` devolve 409 `booking.error.conflict`. O app mostra um toast e volta ao step 2 com refresh.

### Caso E — Token JWT expira durante o polling

Interceptor do axios refresh token automaticamente. Se falhar, redireciona para login mas guarda o `sessionId` activo no AsyncStorage para retomar depois.

---

## 12. Checklist de implementação

- [ ] `PhoneInput` com validação de operadora moçambicana
- [ ] `ReviewScreen` com phone obrigatório e amount calculado
- [ ] `useCreateCheckout` mutation
- [ ] `useCheckoutPolling` query com backoff
- [ ] `CheckoutWaitingScreen` com countdown e tips
- [ ] `CheckoutFailedScreen` com retry
- [ ] `CheckoutExpiredScreen` com retry
- [ ] `BookingSuccessScreen` com `useBooking`
- [ ] Mapping `INS-*` → mensagens em PT
- [ ] `usePushDeepLinking` no layout raiz
- [ ] `AsyncStorage` para retomar checkout activo após restart
- [ ] `refetchIntervalInBackground: false` no polling
- [ ] Limpar `active_checkout_session_id` em estado terminal
- [ ] Toast/erro para 409 `conflict` que volta ao slot picker

---

## 13. Mockup textual dos 4 ecrãs principais

### Review (antes de pagar)

```
┌─────────────────────────────┐
│  ← Resumo da reserva        │
├─────────────────────────────┤
│ Court Camões 1              │
│ Sáb, 10 Mai • 16:00 - 17:00 │
│ 60 minutos                  │
├─────────────────────────────┤
│ Valor total                 │
│           500 MZN           │
├─────────────────────────────┤
│ Número M-Pesa               │
│ [ 84 123 4567        ]      │
│ Vai receber pedido de PIN   │
├─────────────────────────────┤
│ [   Pagar 500 MZN     ]     │
└─────────────────────────────┘
```

### CheckoutWaiting (a aguardar)

```
┌─────────────────────────────┐
│           ⏳               │
│    A aguardar M-Pesa...     │
│                             │
│ Foi enviada uma notificação │
│   para *** 4567. Insira     │
│        o seu PIN.           │
│                             │
│   Tempo restante: 28:42     │
│                             │
│ ─────────────────────────── │
│ Valor:    500 MZN           │
│ Ref:      PAY-AB12CD34      │
│ ─────────────────────────── │
│ ✓ Mantenha telemóvel ligado │
│ ✓ Garanta cobertura         │
│ ✓ Digite o PIN              │
│                             │
│        [ Cancelar ]         │
└─────────────────────────────┘
```

### CheckoutFailed

```
┌─────────────────────────────┐
│           ✗                 │
│   Pagamento recusado        │
│                             │
│ Saldo M-Pesa insuficiente.  │
│                             │
│   [ Tentar novamente ]      │
│   [ Voltar ao início  ]     │
└─────────────────────────────┘
```

### BookingSuccess

```
┌─────────────────────────────┐
│           ✓                 │
│  Reserva confirmada!        │
│                             │
│ Court Camões 1              │
│ Sáb, 10 Mai • 16:00 - 17:00 │
│ Total pago: 500 MZN         │
│                             │
│ [ Ver minhas reservas ]     │
│ [ Reservar outra      ]     │
└─────────────────────────────┘
```
