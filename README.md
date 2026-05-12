# MQTracker

Extensão para Visual Studio Code que permite **inspecionar, debugar e interagir com eventos do RabbitMQ em tempo real**, diretamente no editor.

---

## Funcionalidades

### Observabilidade

- Listar filas, exchanges e bindings
- Visualizar mensagens em tempo real por fila

### Interação

- ACK / NACK manual
- NACK com re-enfileiramento (NACK + requeue)
- Replay de mensagens
- Publicar eventos para qualquer exchange/routing key

### Histórico

- Histórico persistente de ações ACK/NACK/NACK-requeue por fila
- Badges coloridos por tipo de ação na aba de histórico
- Replay de qualquer entrada do histórico com pré-preenchimento automático do modal

---

## Como usar

1. Abra o MQTracker pela Activity Bar
2. Clique em **+** para criar uma conexão
3. Informe:
   - Host
   - Porta
   - Usuário e senha
   - Porta do Management
   - Virtual host
4. Expanda a conexão para ver filas e exchanges
5. Clique em uma fila para abrir o painel de inspeção de mensagens
6. Use a aba **History** para ver e reenviar ações anteriores

---

## Arquitetura

O projeto tem **dois processos separados** com builds independentes:

```
src/
  core/models/               # Tipos puros: Connection, Queue, Exchange, Binding, Message, HistoryEntry
  core/ports/                # Interfaces: IBrokerClient, IManagementApi, IMessageStore
  core/services/             # MessageBuffer, ReplayService, ConsumerScanner
  infra/amqp/                # AmqpClient -> canais separados para consume e publish
  infra/http/                # ManagementApiClient
  infra/storage/             # ConfigStore (globalState + SecretStorage) + HistoryStore (SQLite)
  controllers/               # ConnectionController -> hub de sessões ativas
  ui/tree/                   # RabbitTreeProvider + TreeNode
  ui/commands/               # registerCommands -> todos os comandos mqtracker
  ui/webview/                # MessageViewerPanel + protocol.ts

webview-ui/src/
  api/vscodeBridge.ts
  state/store.ts             # Store + histórico
  render.ts                  # DOM puro
```

### Comunicação host ↔ webview

Contrato compartilhado em `src/ui/webview/protocol.ts`:

- **Host → Webview**

  - `messagesLoaded`
  - `messagesBatch`
  - `messageAdded`
  - `clear`

- **Webview → Host**

  - `ready`
  - `ack`
  - `nack`
  - `replay`
  - `publish`

---

## Segurança

- Configurações de conexão persistidas via `vscode.Memento` (globalState)
- Credenciais armazenadas com `vscode.SecretStorage` (keychain do sistema operacional)
- Histórico de ações em SQLite local

---

## Stack

- TypeScript
- VS Code Extension API
- amqplib (AMQP)
- RabbitMQ Management HTTP API
- SQLite
