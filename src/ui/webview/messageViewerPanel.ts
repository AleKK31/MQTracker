import * as vscode from "vscode";
import * as crypto from "crypto";
import { z } from "zod";
import type { ConnectionController } from "../../controllers/connectionController";
import type { Message } from "../../core/models/message";
import { toWebviewMessage, type WebviewMessage } from "./protocol";
import type { Logger } from "../../utils/logger";
import type { HistoryStore } from "../../infra/storage/historyStore";
import type { HistoryAction } from "../../core/models/historyEntry";

const WebviewToHostSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("ack"), id: z.string() }),
  z.object({ type: z.literal("nack"), id: z.string(), requeue: z.boolean() }),
  z.object({ type: z.literal("replay"), id: z.string() }),
  z.object({
    type: z.literal("publish"),
    exchange: z.string(),
    routingKey: z.string(),
    body: z.string(),
    contentType: z.string(),
    deliveryMode: z.union([z.literal(1), z.literal(2)]),
    headers: z.record(z.string(), z.string()),
    properties: z.record(z.string(), z.string()),
  }),
]);

export class MessageViewerPanel {
  private static readonly panels = new Map<string, MessageViewerPanel>();
  private static readonly DEBOUNCE_MS = 50;

  private readonly panel: vscode.WebviewPanel;
  private readonly pendingMessages: WebviewMessage[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private activeConsumerTag: string | null = null;

  private constructor(
    private readonly connectionId: string,
    private readonly queueName: string,
    private readonly controller: ConnectionController,
    private readonly logger: Logger,
    private readonly extensionUri: vscode.Uri,
    private readonly history: HistoryStore
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "mqtracker.messageViewer",
      `MQTracker: ${queueName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist", "webview"),
        ],
      }
    );

    this.panel.onDidDispose(() => this.dispose());
    this.panel.webview.onDidReceiveMessage((raw) => this.handleMessage(raw));
    this.panel.webview.html = this.buildHtml();
  }

  static show(
    connectionId: string,
    queueName: string,
    controller: ConnectionController,
    logger: Logger,
    extensionUri: vscode.Uri,
    history: HistoryStore
  ): MessageViewerPanel {
    const key = `${connectionId}:${queueName}`;
    const existing = MessageViewerPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return existing;
    }

    const instance = new MessageViewerPanel(
      connectionId,
      queueName,
      controller,
      logger,
      extensionUri,
      history
    );
    MessageViewerPanel.panels.set(key, instance);
    return instance;
  }

  private async handleMessage(raw: unknown): Promise<void> {
    const result = WebviewToHostSchema.safeParse(raw);
    if (!result.success) {
      this.logger.warn("Invalid message from webview", result.error);
      vscode.window.showErrorMessage(`MQTracker: Internal error — ${result.error.issues.map((i) => i.message).join(', ')}`);
      return;
    }

    const msg = result.data;

    switch (msg.type) {
      case "ready":
        await this.onReady();
        break;
      case "ack":
        this.recordHistory(msg.id, "ack");
        this.controller.ackMessage(this.connectionId, msg.id);
        break;
      case "nack":
        this.recordHistory(msg.id, msg.requeue ? "nack-requeue" : "nack");
        this.controller.nackMessage(this.connectionId, msg.id, msg.requeue);
        break;
      case "replay":
        try {
          await this.controller.replayMessage(
            this.connectionId,
            this.queueName,
            msg.id
          );
        } catch (err) {
          this.logger.error("Replay failed", err);
          vscode.window.showErrorMessage(`Replay failed: ${String(err)}`);
        }
        break;
      case "publish": {
        const exchange = msg.exchange.trim();
        const routingKey = msg.routingKey.trim() || (!exchange ? this.queueName : '');
        try {
          const published = this.controller.publishMessage(
            this.connectionId,
            exchange,
            routingKey,
            Buffer.from(msg.body, "utf-8"),
            {
              contentType: msg.contentType,
              deliveryMode: msg.deliveryMode,
              headers: msg.headers,
              ...msg.properties,
            }
          );
          if (published) {
            const dest = exchange
              ? `exchange "${exchange}" (routing key: "${routingKey}")`
              : `queue "${routingKey}"`;
            vscode.window.showInformationMessage(`MQTracker: Message published to ${dest}.`);
          } else {
            vscode.window.showErrorMessage("MQTracker: Publish failed — not connected");
          }
        } catch (err) {
          this.logger.error("Publish failed", err);
          vscode.window.showErrorMessage(
            `MQTracker: Publish failed — ${String(err)}`
          );
        }
        break;
      }
    }
  }

  private recordHistory(messageId: string, action: HistoryAction): void {
    const buffer = this.controller.getOrCreateBuffer(
      this.connectionId,
      this.queueName
    );
    const msg = buffer.get(messageId);
    if (!msg) return;
    this.history.record({
      id: msg.id,
      connectionId: this.connectionId,
      queueName: this.queueName,
      exchange: msg.exchange,
      routingKey: msg.routingKey,
      body: msg.body,
      contentType: msg.contentType || "application/json",
      deliveryMode: 2,
      action,
    });
    this.panel.webview.postMessage({
      type: "historyLoaded",
      entries: this.history.getByQueue(this.connectionId, this.queueName),
    });
  }

  private async onReady(): Promise<void> {
    const session = this.controller.getSession(this.connectionId);
    if (!session) return;

    const buffer = this.controller.getOrCreateBuffer(
      this.connectionId,
      this.queueName
    );
    const existing = buffer.getAll().map(toWebviewMessage);
    this.panel.webview.postMessage({
      type: "messagesLoaded",
      messages: existing,
    });
    this.panel.webview.postMessage({
      type: "historyLoaded",
      entries: this.history.getByQueue(this.connectionId, this.queueName),
    });

    this.activeConsumerTag = await this.controller.subscribeQueue(
      this.connectionId,
      this.queueName,
      (msg) => this.enqueueForWebview(msg)
    );
  }

  private enqueueForWebview(msg: Message): void {
    this.pendingMessages.push(toWebviewMessage(msg));

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const batch = this.pendingMessages.splice(0);
      if (batch.length > 0) {
        this.panel.webview.postMessage({
          type: "messagesBatch",
          messages: batch,
        });
      }
    }, MessageViewerPanel.DEBOUNCE_MS);
  }

  private buildHtml(): string {
    const nonce = crypto.randomBytes(16).toString("hex");
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "main.js")
    );
    const cspSource = this.panel.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' ${cspSource};
             style-src 'unsafe-inline' ${cspSource};
             img-src ${cspSource} data:;" />
  <title>MQTracker: ${this.queueName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    input, textarea, select, button { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    #toolbar { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; align-items: center; }
    #filter-input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 8px; border-radius: 2px; outline: none; }
    #filter-input:focus { border-color: var(--vscode-focusBorder); }
    .btn { border: none; padding: 4px 12px; border-radius: 2px; cursor: pointer; white-space: nowrap; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-ghost { background: transparent; color: var(--vscode-descriptionForeground); padding: 2px 6px; }
    .btn-ghost:hover { color: var(--vscode-foreground); }
    #main { display: flex; flex: 1; overflow: hidden; }
    #main.hidden { display: none; }
    #message-list { flex: 1; overflow-y: auto; border-right: 1px solid var(--vscode-panel-border); }
    .msg-row { padding: 6px 12px; cursor: pointer; border-bottom: 1px solid var(--vscode-panel-border, #333); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .msg-row:hover { background: var(--vscode-list-hoverBackground); }
    .msg-row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .msg-row .rk { color: var(--vscode-symbolIcon-stringForeground); margin-right: 8px; }
    .msg-row .ts { color: var(--vscode-descriptionForeground); font-size: 11px; }
    #detail { width: 360px; overflow-y: auto; padding: 12px; flex-shrink: 0; display: none; flex-direction: column; gap: 8px; }
    #detail.visible { display: flex; }
    #detail h3 { font-size: 13px; }
    #detail pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 2px; font-size: 11px; white-space: pre-wrap; word-break: break-all; max-height: 220px; overflow-y: auto; }
    #detail .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    #detail .actions button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 4px 10px; border-radius: 2px; cursor: pointer; font-size: 12px; }
    #detail .actions button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    #detail .meta { font-size: 11px; color: var(--vscode-descriptionForeground); }
    #empty { padding: 24px; color: var(--vscode-descriptionForeground); text-align: center; }
    /* Modal overlay */
    #modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 50; display: none; align-items: center; justify-content: center; }
    #modal-overlay.open { display: flex; }
    #modal-overlay.open:focus { outline: none; }
    .modal { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; width: 560px; max-height: 86vh; overflow-y: auto; display: flex; flex-direction: column; }
    .modal-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; align-items: center; justify-content: space-between; }
    .modal-header h2 { font-size: 13px; font-weight: 600; }
    .modal-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
    .modal-footer { padding: 10px 16px; border-top: 1px solid var(--vscode-panel-border); display: flex; justify-content: flex-end; gap: 8px; }
    .pub-info { font-size: 11px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background, rgba(127,127,127,.1)); padding: 6px 10px; border-radius: 3px; border-left: 3px solid var(--vscode-focusBorder); }
    .pub-info strong { color: var(--vscode-foreground); }
    .field-label { font-size: 11px; color: var(--vscode-descriptionForeground); display: block; margin-bottom: 3px; }
    .field-input { width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 5px 8px; border-radius: 2px; outline: none; }
    .field-input:focus { border-color: var(--vscode-focusBorder); }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .kv-section-title { font-size: 11px; font-weight: 600; color: var(--vscode-foreground); margin-bottom: 4px; }
    .kv-row { display: grid; grid-template-columns: 1fr 16px 1fr auto; gap: 6px; align-items: center; margin-bottom: 6px; }
    .kv-eq { color: var(--vscode-descriptionForeground); font-size: 13px; text-align: center; }
    .kv-del { background: transparent; border: none; color: var(--vscode-descriptionForeground); cursor: pointer; padding: 2px 4px; border-radius: 2px; font-size: 14px; line-height: 1; }
    .kv-del:hover { color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,.1)); }
    .add-link { font-size: 11px; color: var(--vscode-textLink-foreground); cursor: pointer; background: none; border: none; padding: 0; text-decoration: underline; }
    .add-link:hover { color: var(--vscode-textLink-activeForeground); }
    #pub-payload { width: 100%; min-height: 90px; resize: vertical; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 6px 8px; border-radius: 2px; outline: none; }
    #pub-payload:focus { border-color: var(--vscode-focusBorder); }
    /* Tabs */
    #tabs { display: flex; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
    .tab { padding: 6px 16px; cursor: pointer; font-size: 12px; border-bottom: 2px solid transparent; color: var(--vscode-descriptionForeground); background: none; border-top: none; border-left: none; border-right: none; }
    .tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }
    #tab-history { display: none; flex: 1; overflow-y: auto; }
    #tab-history.active { display: flex; flex-direction: column; }
    .history-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .history-table th { text-align: left; padding: 6px 10px; color: var(--vscode-descriptionForeground); font-weight: 600; border-bottom: 1px solid var(--vscode-panel-border); position: sticky; top: 0; background: var(--vscode-editor-background); }
    .history-table td { padding: 5px 10px; border-bottom: 1px solid var(--vscode-panel-border, #222); vertical-align: top; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge-ack { background: rgba(78,201,89,.15); color: #4ec959; }
    .badge-nack { background: rgba(229,83,75,.15); color: #e5534b; }
    .badge-nack-requeue { background: rgba(210,153,34,.15); color: #d2991c; }
    #history-empty { padding: 24px; color: var(--vscode-descriptionForeground); text-align: center; }
    .btn-replay-history { background: transparent; border: 1px solid var(--vscode-button-secondaryBackground); color: var(--vscode-foreground); padding: 2px 8px; border-radius: 2px; cursor: pointer; font-size: 11px; white-space: nowrap; }
    .btn-replay-history:hover { background: var(--vscode-button-secondaryBackground); }
  </style>
</head>
<body>
  <div id="toolbar">
    <input id="filter-input" type="text" placeholder="Filter by routing key, body, exchange…" />
    <button class="btn btn-secondary" id="clear-btn">Clear</button>
    <button class="btn btn-primary" id="publish-btn">Publish</button>
  </div>
  <div id="tabs">
    <button class="tab active" data-tab="messages">Messages</button>
    <button class="tab" data-tab="history">History</button>
  </div>
  <div id="tab-history"><div id="history-empty">No actions yet.</div></div>
  <div id="main">
    <div id="message-list"><div id="empty">Waiting for messages…</div></div>
    <div id="detail">
      <h3 id="detail-routing-key"></h3>
      <div class="meta" id="detail-meta"></div>
      <pre id="detail-body"></pre>
      <div class="actions">
        <button id="btn-ack">Ack</button>
        <button id="btn-nack">Nack</button>
        <button id="btn-nack-requeue">Nack + Requeue</button>
        <button id="btn-replay">Replay</button>
      </div>
    </div>
  </div>
  <div id="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal">
      <div class="modal-header">
        <h2 id="modal-title">Publish message</h2>
        <button class="btn-ghost btn" id="pub-close" title="Close (Escape)">✕</button>
      </div>
      <div class="modal-body">
        <div class="pub-info" id="pub-info">
          Message will be published to the <strong>default exchange</strong> with routing key <strong id="pub-info-rk">${this.queueName}</strong>.
        </div>

        <div class="two-col">
          <div>
            <span class="field-label">Exchange</span>
            <input class="field-input" id="pub-exchange" type="text" placeholder="(default)" autocomplete="off" />
          </div>
          <div>
            <span class="field-label">Routing Key</span>
            <input class="field-input" id="pub-routing-key" type="text" placeholder="${this.queueName}" autocomplete="off" />
          </div>
        </div>

        <div class="two-col">
          <div>
            <span class="field-label">Delivery mode</span>
            <select class="field-input" id="pub-delivery-mode">
              <option value="1">Non-Persistent</option>
              <option value="2">Persistent</option>
            </select>
          </div>
          <div>
            <span class="field-label">Content-Type</span>
            <select class="field-input" id="pub-content-type">
              <option value="application/json">application/json</option>
              <option value="text/plain">text/plain</option>
              <option value="application/octet-stream">application/octet-stream</option>
            </select>
          </div>
        </div>

        <div>
          <div class="kv-section-title">Headers</div>
          <div id="pub-headers"></div>
          <button class="add-link" id="add-header">+ Add header</button>
        </div>

        <div>
          <div class="kv-section-title">Properties</div>
          <div id="pub-properties"></div>
          <button class="add-link" id="add-property">+ Add property</button>
        </div>

        <div>
          <span class="field-label">Payload</span>
          <textarea id="pub-payload" spellcheck="false" placeholder='{"key": "value"}'></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="pub-cancel">Cancel</button>
        <button class="btn btn-primary" id="pub-send">Publish</button>
      </div>
    </div>
  </div>
  <div id="error-boundary" style="display:none;padding:24px;color:var(--vscode-errorForeground);">
    MQTracker failed to initialize. Please reload the window (<code>Developer: Reload Window</code>).
    <pre id="error-detail" style="font-size:11px;margin-top:8px;"></pre>
  </div>
  <script nonce="${nonce}">
    window.onerror = function(msg, _src, _line, _col, err) {
      document.getElementById('error-boundary').style.display = 'block';
      document.getElementById('error-detail').textContent = err ? err.stack || String(err) : String(msg);
      document.getElementById('main').style.display = 'none';
      document.getElementById('toolbar').style.display = 'none';
    };
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    const key = `${this.connectionId}:${this.queueName}`;
    MessageViewerPanel.panels.delete(key);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.activeConsumerTag) {
      this.controller
        .unsubscribeQueue(this.connectionId, this.activeConsumerTag)
        .catch(() => undefined);
    }
    this.panel.dispose();
  }
}
