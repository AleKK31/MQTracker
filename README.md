# TraceMQ

Extensão para Visual Studio Code que permite **inspecionar, debugar e interagir com eventos do RabbitMQ em tempo real**, diretamente no editor.

---

## Funcionalidades

### Observabilidade

- Listar filas, exchanges e bindings
- Visualizar mensagens em tempo real por fila

### Interação

- ACK / NACK manual
- Replay de mensagens
- Publicar eventos para qualquer exchange/routing key

---

## Como usar

1. Abra o TraceMQ pela Activity Bar
2. Clique em **+** para criar uma conexão
3. Informe:
   - Host
   - Porta
   - Credenciais
   - Management Port
4. Expanda a conexão
5. Clique em uma fila para começar a inspecionar mensagens

---

## Arquitetura

core/ — modelos e interfaces puras  
infra/ — integração com RabbitMQ (AMQP + HTTP API)  
controllers/ — orquestração de conexões, buffers e estado  
ui/ — TreeView, comandos e Webviews

---

### Comunicação host ↔ webview

Contrato compartilhado:

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

- Configurações persistidas via `vscode.Memento`
- Credenciais armazenadas com `vscode.SecretStorage` (keychain do sistema)

---

## Stack

- TypeScript
- VS Code Extension API
- amqplib (AMQP)
- HTTP API do RabbitMQ
