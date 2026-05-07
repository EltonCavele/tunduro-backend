# Painel de Administração - Tunduro

Este documento especifica todos os requisitos e funcionalidades para o painel de administração do sistema Tunduro.

## 1. Visão Geral

O painel de administração é uma interface web para gestão centralizada do sistema de reservas de courts desportivos. Permite gerir utilizadores, reservas, courts, pagamentos, iluminação e configurações do sistema.

## 2. Autenticação

### 2.1 Login

- Email e password
- Proteção contra brute-force (tentativas limitadas)
- Sessão com JWT access token

### 2.2 Permissões

| Role    | Descrição                                            |
| ------- | ---------------------------------------------------- |
| ADMIN   | Acesso total a todas as funcionalidades              |
| TRAINER | Gestão limitada (apenas relativas aos seus clientes) |

## 3. Módulos do Admin Panel

### 3.1 Gestão de Utilizadores

#### Lista de Utilizadores

- Pesquisar por nome, email, telefone
- Filtrar por role (USER, ADMIN, TRAINER)
- Filtrar por género (MALE, FEMALE, OTHER)
- Filtrar por estado de verificação (verificado/não verificado)
- Filtrar por data de registo
- Ordenar por nome, data de registo, último login
- Paginação com 20/50/100 items por página

#### Dados do Utilizador

- ID único (UUID)
- Email (único)
- Nome completo (firstName, lastName)
- Avatar URL
- Phone (número)
- Level (nível de jogo)
- Favorite Court
- Preferred Time Slots
- Gender (MALE, FEMALE, OTHER)
- Role (USER, ADMIN, TRAINER)
- isVerified
- Notify Push / SMS / Email
- Data de criação e última atualização

#### Ações Admin

- Criar utilizador manualmente
- Editar perfil (nome, phone, role, verified status)
- Alterar password
- Ver histórico de reservas
- Ver histórico de pagamentos
- Eliminar utilizador (soft delete - deletedAt)
- Forçar logout (incrementar tokenVersion)

### 3.2 Gestão de Courts

#### Lista de Courts

- Pesquisar por nome
- Filtrar por tipo (INDOOR, OUTDOOR)
- Filtrar por estado (ativo/inativo)
- Ordenar por nome, preço, data de criação

#### Dados do Court

- ID único (UUID)
- Nome
- Type (INDOOR, OUTDOOR)
- Surface (tipo de piso)
- Has Lighting (tem iluminação)
- Lighting Device IDs (array de IDs dos dispositivos Tuya)
- Lighting Enabled (iluminação ativa)
- Lighting On Offset Min (minutos antes para ligar)
- Lighting Off Buffer Min (minutos de buffer para desligar)
- Quiet Hours Enabled
- Quiet Hours Start (ex: "22:00")
- Quiet Hours End (ex: "06:00")
- Quiet Hours Hard Block
- Rules (regras do court)
- Price Per Hour
- Currency (MZN)
- Max Players
- Is Active
- Images (array de URLs com sortOrder)

#### Ações Admin

- Criar court (com upload de imagens)
- Editar court (incluir/excluir imagens)
- Ativar/desativar court
- Eliminar court (soft delete + cancelar reservas futuras)
- Configurar iluminação (device IDs, offsets)
- Configurar quiet hours
- Definir preço por hora
- Definir regras

### 3.3 Gestão de Reservas

#### Lista de Reservas

- Pesquisar por ID, nome do organizador
- Filtrar por status (PENDING, CONFIRMED, CANCELLED, NO_SHOW, COMPLETED)
- Filtrar por court
- Filtrar por data (data específica, range de datas)
- Filtrar por organizador
- Ordenar por data, status, preço

#### Dados da Reserva

- ID único (UUID)
- Court ID e nome
- Organizer ID e nome
- Start At / End At
- Duration Minutes
- Total Price / Paid Amount
- Currency
- Status (PENDING → CONFIRMED → COMPLETED ou CANCELLED/NO_SHOW)
- Payment Due At
- Cancelled At / Cancellation Reason
- Checked In At / Check In Token
- Is Admin Forced
- Lista de participantes (com status)
- Lista de convites (com status)
- Histórico de mudanças de status

#### Waitlist Integrada

Quando uma reserva é clicada, mostrar painel lateral com:

- **Fila de Espera**: Lista de utilizadores na waitlist para esse horário
  - Position (posição)
  - User name / phone
  - Status (WAITING, OFFERED, ACCEPTED, EXPIRED, REMOVED, CANCELLED)
  - Data de entrada
- **Ações**:
  - Oferecer espaço manualmente (muda para OFFERED)
  - Remover da fila
  - Ver detalhes do utilizador

#### Ações Admin

- Criar reserva manualmente
- Editar reserva (data, court, preço)
- Alterar status (confirmar, cancelar, marcar no-show)
- Cancelar reserva (com razão)
- Check-in manual
- Ver detalhes completos
- Exportar reservas (CSV/Excel)

### 3.4 Gestão de Pagamentos

#### Lista de Transações

- Pesquisar por referência, ID da reserva
- Filtrar por status (PENDING, COMPLETED, FAILED, REFUNDED, CANCELLED)
- Filtrar por tipo (BOOKING, RESCHEDULE_FEE, etc.)
- Filtrar por data
- Filtrar por utilizador

#### Tipos de Pagamento

- BOOKING - Reserva normal
- RESCHEDULE_FEE - Taxa de remarcação
- RESCHEDULE_DIFFERENCE - Diferença de preço
- CANCELLATION_REFUND - Reembolso de cancelamento
- CANCELLATION_PENALTY - Penalização de cancelamento
- WAITLIST_CLAIM -Claim da waitlist
- ADMIN_ADJUSTMENT - Ajuste administrativo
- OVERTIME_ADJUSTMENT - Ajuste de horas extra

#### Dados da Transação

- ID único (UUID)
- Booking ID
- User ID
- Type
- Status
- Amount
- Currency
- Reference (único)
- Metadata (JSON)
- Processed At

#### Ações Admin

- Ver detalhes da transação
- Processar reembolso
- Criar ajuste manual
- Exportar transações

### 3.5 Gestão de Waitlist

#### Lista de Entradas na Waitlist

- Filtrar por court
- Filtrar por status (WAITING, OFFERED, ACCEPTED, EXPIRED, REMOVED, CANCELLED)
- Filtrar por data

#### Dados da Waitlist Entry

- ID único (UUID)
- Court ID
- User ID
- Booking ID (se oferecido)
- Start At / End At
- Status
- Position (posição na fila)
- Offered At / Offer Expires At

#### Ações Admin

- Ver fila de espera
- Oferecer espaço manualmente
- Remover entrada

### 3.6 Iluminação (Tuya)

#### Dashboard de Iluminação

- Lista de devices por court
- Estado online/offline
- Última comunicação
- Histórico de comandos

#### Dados do Device

- Device ID
- Court ID
- Is Online
- Last Ping At
- Last Command At / Action / Success
- Last Error

#### Histórico de Ações

- Logs de todas as ações de iluminação
- Filtrar por court, data, source (SYSTEM, ADMIN), action type
- Ação, sucesso/falha, tentativas, erro

#### Ações Admin

- Ligar iluminação manualmente
- Desligar iluminação manualmente
- Testar switch
- Sincronizar estado
- Ver logs de erros
- Configurar offsets por court

### 3.7 Relatórios e Analytics

#### Dashboard Principal

- Total de utilizadores (ativos, novos este mês)
- Total de reservas (por status, por court)
- Receita total (por período)
- Taxa de ocupação dos courts
- Reservas por dia/semana/mes

#### Relatórios

- Utilizadores mais ativos
- Courts mais populares
- Receita por court
- Cancelamentos por período
- No-show rate

#### Gráficos

- Reservas por dia (gráfico de barras)
- Receita por mês (gráfico de linha)
- Distribuição por tipo de court
- Estado das reservas (pie chart)

### 3.8 Configurações do Sistema

#### Configurações Gerais

- Nome da aplicação
- Currency padrão
- Taxa de cancelamento
- Quiet hours globais

#### Configurações de Notificações

- Notificações push enabled
- Notificações SMS enabled
- Notificações email enabled

#### Configurações de Pagamento

- Paysuite API keys (sandbox/production)
- Webhook URLs

#### Configurações de Iluminação

- Tuya API credentials
- Default offsets

## 4. Requisitos Técnicos

### 4.1 UI/UX

- Design responsivo (mobile, tablet, desktop)
- Tema claro/escuro
- Tabelas com ordenação e filtros
- Formulários com validação
- Notificações toast (sucesso/erro)
- Loading states

### 4.2 API Endpoints Existentes

O backend já possui endpoints admin em `/admin`:

- `DELETE /admin/user/:id` - Eliminar utilizador
- `POST /admin/courts` - Criar court
- `PUT /admin/courts/:id` - Atualizar court
- `DELETE /admin/courts/:id` - Eliminar court

### 4.3 Melhorias Necessárias

Adicionar endpoints admin para:

- Lista de utilizadores com filtros
- Editar utilizador
- Lista de reservas
- Editar reserva/cancelar
- Lista de transações
- Processar refunds
- Lista de waitlist
- Dashboard stats
- Logs de iluminação

## 5. Fluxos de Trabalho

### 5.1 Cancelamento de Reserva Admin

1. Admin visualiza reserva
2. Clica em "Cancelar"
3. Seleciona razão (ou introduz reason personalizada)
4. Sistema calcula reembolso se aplicável
5. Sistema cria transação de refund
6. Sistema notifica utilizador
7. Histórico atualizado

### 5.2 Gestão de Iluminação

1. Admin seleciona court
2. Visualiza estado atual dos devices
3. Pode enviar comando manual
4. Sistema regista no LightingActionLog
5. Atualiza estado do device

### 5.3 Criação de Reserva Admin

1. Admin seleciona court e data/hora
2. Sistema verifica disponibilidade
3. Admin seleciona utilizador ou cria novo
4. Admin define preço (ou usa preço padrão)
5. Sistema cria reserva com status CONFIRMED
6. Sistema cria transação de pagamento
7. Sistema notifica utilizador

## 6. Considerações de Segurança

- Todos os endpoints requerem JWT com role ADMIN
- Rate limiting em operações sensíveis
- Audit log de todas as ações admin
- Validação rigorosa de inputs
- Sanitização de dados exibidos

## 7. Futuras Expansões

- Multi-tenant (múltiplas instalações)
- Relatórios exportáveis em PDF
- Integração com calendários externos
- Sistema de mensagens broadcast
- Gestão de trainers e agendamentos
