# NodeWarBot - Black Desert Online Node War Manager

[English](#english) | [Portugues (Brasil)](#portugues-brasil)

---

# English

## What is NodeWarBot?

NodeWarBot is an open-source Discord bot to create and manage Node War events with interactive role signups, waitlist logic, and scheduled publication.

## Main Features

- Interactive event creation via `/createwar` modal:
  - Name
  - Type/description
  - Timezone
  - Publish time (`HH:mm`)
  - Duration (minutes)
- Multi-day scheduling:
  - Select one or many week days for the same event setup
  - Creates one scheduled event per selected day (same `groupId`)
- Optional role mentions on publish:
  - Select Discord roles to mention when scheduler posts the event
- Role management:
  - Bulk role creation
  - Role edits with `/editrole`
  - Permission restrictions per event role
- Signup and waitlist system:
  - One user cannot stay in two event roles at the same time
  - Waitlist promotion when a slot opens
  - DM notification on promotion, with channel mention fallback
- Scheduler automation:
  - Auto-publishes events at configured day/time
  - Uses selected mentions in the published message
  - Event expiration based on configured duration
  - Removes event message when it expires
- Persistence in `data/wars.json`

## Requirements

- Node.js 16.6.0+
- npm
- Discord bot token and app credentials
- Admin permissions in target server(s)

## Installation

```bash
git clone https://github.com/bverab/NodeWarBot.git
cd NodeWarBot
npm install
```

## Environment Variables

Create `.env` in project root:

```env
TOKEN=your_bot_token
CLIENT_ID=your_app_client_id
GUILD_ID=123456789012345678,987654321098765432
```

Notes:
- `GUILD_ID` supports one or many guild IDs separated by commas.
- `register-commands.js` validates IDs and skips invalid entries.

## Register Slash Commands

```bash
node src/register-commands.js
```

## Run Bot

```bash
node src/index.js
```

## Command Summary

- `/createwar`: starts event creation flow
- `/editrole`: rename/slots/icon/clearicon for event roles
- `/fakeuser`: test waitlist and slot behavior
- `/ping`: bot latency check

## Waitlist Rules

- If target role is full, user goes to waitlist for that role.
- If user was in another event role and tries to switch to a full role:
  - user is removed from previous role,
  - user is added to waitlist for the selected role.
- Promotion from waitlist keeps role consistency (no double-role state).

## Troubleshooting

- Commands not showing:
  - run `node src/register-commands.js`
  - verify `CLIENT_ID` and `GUILD_ID`
- No promotion DM:
  - user may have DMs disabled for server
  - bot falls back to channel mention notification
- Scheduler not publishing:
  - verify bot is running continuously
  - verify event day/time/timezone in data and UI flow

---

# Portugues (Brasil)

## O que e o NodeWarBot?

NodeWarBot e um bot open-source para Discord que cria e gerencia eventos de Node War com inscricao por botoes, fila de espera e publicacao automatica por horario.

## Principais Recursos

- Criacao de evento por modal `/createwar` com:
  - Nome
  - Tipo/descricao
  - Timezone
  - Hora de publicacao (`HH:mm`)
  - Duracao (minutos)
- Agendamento em varios dias da semana:
  - seleciona 1+ dias
  - cria um evento agendado por dia (mesmo `groupId`)
- Mencoes opcionais ao publicar:
  - seleciona cargos para mencionar quando o scheduler publicar
- Gerenciamento de papeis:
  - adicao em lote
  - edicao com `/editrole`
  - restricoes de permissao por papel
- Inscricao e fila de espera:
  - usuario nao fica em dois papeis ao mesmo tempo
  - promocao automatica quando abre vaga
  - notificacao por DM na promocao, com fallback no canal
- Automacao do scheduler:
  - publica automaticamente no dia/hora configurados
  - usa as mencoes definidas
  - encerra evento por duracao
  - remove mensagem do evento ao expirar
- Persistencia em `data/wars.json`

## Requisitos

- Node.js 16.6.0+
- npm
- Credenciais do app Discord
- Permissao de administrador no(s) servidor(es)

## Instalacao

```bash
git clone https://github.com/bverab/NodeWarBot.git
cd NodeWarBot
npm install
```

## Variaveis de Ambiente

Crie `.env` na raiz:

```env
TOKEN=seu_token_do_bot
CLIENT_ID=seu_client_id
GUILD_ID=123456789012345678,987654321098765432
```

Observacoes:
- `GUILD_ID` aceita um ou varios IDs separados por virgula.
- `register-commands.js` valida os IDs e ignora entradas invalidas.

## Registrar Comandos Slash

```bash
node src/register-commands.js
```

## Executar o Bot

```bash
node src/index.js
```

## Resumo de Comandos

- `/createwar`: inicia fluxo de criacao
- `/editrole`: editar nome/slots/icone/clearicon
- `/fakeuser`: testar fila de espera e vagas
- `/ping`: latencia do bot

## Regras de Waitlist

- Se o papel alvo estiver cheio, usuario entra na fila desse papel.
- Se tentar trocar de papel para um papel cheio:
  - sai do papel anterior,
  - entra na fila do papel selecionado.
- Promocao da fila respeita consistencia (sem usuario em dois papeis).

## Solucao de Problemas

- Comandos nao aparecem:
  - execute `node src/register-commands.js`
  - confira `CLIENT_ID` e `GUILD_ID`
- DM de promocao nao chegou:
  - usuario pode ter DM bloqueado no servidor
  - bot usa fallback com mencao no canal
- Scheduler nao publica:
  - confirme bot rodando continuamente
  - valide dia/hora/timezone do evento
