# 🎮 NodeWarBot - Black Desert Online Node War Manager

[English](#-english) | [Português (Brasil)](#-português-brasil)

---

# English

## 🎯 What is NodeWarBot?

**NodeWarBot** is an open-source Discord bot designed to manage **Node Wars** in Black Desert Online. It allows clan leaders to create, organize, and administer war events interactively directly from Discord.

## ✨ Main Features

- ✅ **Event Creation** - Create Node Wars with name, schedule, and description
- ✅ **Role Management** - Define roles (Tanks, DPS, Supports, etc.) with limited slots
- ✅ **Registration System** - Players sign up by clicking buttons
- ✅ **Automatic Waitlist** - If a role is full, users are added to a waitlist
- ✅ **Permission Control** - Assign specific Discord roles to event roles
- ✅ **Custom Icons** - Add personalized emojis to each role
- ✅ **Interactive Messages** - Clean and easy-to-use interface in Discord
- ✅ **Data Persistence** - Events are automatically saved to JSON

## 🚀 Quick Start

### Prerequisites

- **Node.js** version 16.6.0 or higher
- **npm** (usually comes with Node.js)
- A **Discord Account**
- **Administrator permissions** in the Discord server where you'll deploy the bot

### Installation

```bash
# Clone the repository
git clone https://github.com/youruser/NodeWarBot.git
cd NodeWarBot

# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the project root with your credentials:

```env
TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here
```

**Where to get these credentials?**

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and copy the TOKEN
4. Go to "General Information" and copy the CLIENT_ID
5. GUILD_ID is your server ID (enable Developer Mode in Discord to see IDs)

### Register Commands

```bash
node src/register-commands.js
```

### Run the Bot

```bash
node src/index.js
```

## 📚 Commands Guide

### `/createwar`
Creates a new Node War event with name, schedule, and optional roles.

### `/editrole`
Edit roles in your event:
- `rename` - Change role name
- `slots` - Change available slots
- `icon` - Add custom emoji
- `clearicon` - Remove emoji
- `delete` - Delete a role

### `/fakeuser`
Testing command to simulate fake users in your event.

### `/ping`
Check the bot's latency to Discord servers.

## 📁 Project Structure

```
NodeWarBot/
├── src/
│   ├── index.js
│   ├── register-commands.js
│   ├── commands/
│   ├── handlers/
│   ├── services/
│   ├── utils/
│   ├── models/
│   ├── interactions/
│   └── events/
├── data/
│   └── wars.json
├── package.json
├── .env
└── README.md
```

## 🔧 Configuration

The `.env` file should contain your Discord credentials. **Never commit this file to version control.**

### Data Storage

Events are saved in `data/wars.json` with the following structure:
- Event ID, name, type (schedule/description)
- Roles with max slots and emoji
- Registered participants
- Waitlist entries

## 🐛 Troubleshooting

**Bot doesn't connect:**
- Verify the TOKEN in `.env` is correct
- Regenerate the token in Discord Developer Portal if needed

**Commands don't appear:**
```bash
node src/register-commands.js
node src/index.js
```

**Permission issues:**
- Ensure bot has proper Discord server permissions
- Check that GUILD_ID is correctly set

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the project
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is under ISC license.

---

# Português (Brasil)

## 🎯 O que é NodeWarBot?

**NodeWarBot** é um bot Discord de código aberto projetado para gerenciar **Node Wars** em Black Desert Online. Permite que líderes de clã criem, organizem e administrem eventos de guerra interativamente do Discord.

## ✨ Principais Características

- ✅ **Criação de Eventos** - Crie Node Wars com nome, horário e descrição
- ✅ **Gerenciamento de Papéis** - Defina papéis (Tanques, DPS, Suporte, etc.) com slots limitados
- ✅ **Sistema de Inscrição** - Jogadores se inscrevem clicando em botões
- ✅ **Lista de Espera Automática** - Se um papel estiver cheio, usuários são adicionados à fila
- ✅ **Controle de Permissões** - Atribua papéis Discord específicos aos papéis do evento
- ✅ **Ícones Personalizados** - Adicione emojis personalizados a cada papel
- ✅ **Mensagens Interativas** - Interface limpa e fácil de usar no Discord
- ✅ **Persistência de Dados** - Eventos são salvos automaticamente em JSON

## 🚀 Início Rápido

### Pré-requisitos

- **Node.js** versão 16.6.0 ou superior
- **npm** (geralmente vem com Node.js)
- Uma **Conta do Discord**
- **Permissões de administrador** no servidor Discord onde você implantará o bot

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seuusuario/NodeWarBot.git
cd NodeWarBot

# Instale as dependências
npm install
```

### Configuração

Crie um arquivo `.env` na raiz do projeto com suas credenciais:

```env
TOKEN=seu_token_do_bot_aqui
CLIENT_ID=seu_client_id_aqui
GUILD_ID=seu_guild_id_aqui
```

**Onde obter essas credenciais?**

1. Vá para [Discord Developer Portal](https://discord.com/developers/applications)
2. Crie uma nova aplicação
3. Vá para a seção "Bot" e copie o TOKEN
4. Vá para "General Information" e copie o CLIENT_ID
5. GUILD_ID é o ID do seu servidor (ative Modo de Desenvolvedor no Discord para ver IDs)

### Registre os Comandos

```bash
node src/register-commands.js
```

### Execute o Bot

```bash
node src/index.js
```

## 📚 Guia de Comandos

### `/createwar`
Cria um novo evento de Node War com nome, horário e papéis opcionais.

### `/editrole`
Edite papéis do seu evento:
- `rename` - Mude o nome do papel
- `slots` - Mude os slots disponíveis
- `icon` - Adicione emoji personalizado
- `clearicon` - Remova emoji
- `delete` - Delete um papel

### `/fakeuser`
Comando de teste para simular usuários falsos no seu evento.

### `/ping`
Verifique a latência do bot para os servidores Discord.

## 📁 Estrutura do Projeto

```
NodeWarBot/
├── src/
│   ├── index.js
│   ├── register-commands.js
│   ├── commands/
│   ├── handlers/
│   ├── services/
│   ├── utils/
│   ├── models/
│   ├── interactions/
│   └── events/
├── data/
│   └── wars.json
├── package.json
├── .env
└── README.md
```

## 🔧 Configuração

O arquivo `.env` deve conter suas credenciais do Discord. **Nunca faça commit deste arquivo no controle de versão.**

### Armazenamento de Dados

Os eventos são salvos em `data/wars.json` com a seguinte estrutura:
- ID do evento, nome, tipo (horário/descrição)
- Papéis com slots máximos e emoji
- Participantes registrados
- Entradas da fila de espera

## 🐛 Solução de Problemas

**O bot não se conecta:**
- Verifique se o TOKEN em `.env` está correto
- Regenere o token no Portal de Desenvolvimento do Discord se necessário

**Os comandos não aparecem:**
```bash
node src/register-commands.js
node src/index.js
```

**Problemas de permissão:**
- Certifique-se de que o bot tem permissões apropriadas no servidor Discord
- Verifique se GUILD_ID está definido corretamente

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça um Fork do projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob licença ISC.
