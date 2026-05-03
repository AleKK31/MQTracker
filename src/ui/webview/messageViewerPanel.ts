import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { z } from 'zod';
import type { ConnectionController } from '../../controllers/connectionController';
import type { Message } from '../../core/models/message';
import { toWebviewMessage, type WebviewMessage } from './protocol';
import type { Logger } from '../../utils/logger';

const WebviewToHostSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('ack'), id: z.string() }),
  z.object({ type: z.literal('nack'), id: z.string(), requeue: z.boolean() }),
  z.object({ type: z.literal('replay'), id: z.string() }),
  z.object({
    type: z.literal('publish'),
    exchange: z.string(),
    routingKey: z.string(),
    body: z.string(),
    contentType: z.string(),
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
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'mqtracker.messageViewer',
      `MQTracker: ${queueName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      },
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
  ): MessageViewerPanel {
    const key = `${connectionId}:${queueName}`;
    const existing = MessageViewerPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.One);
      return existing;
    }

    const instance = new MessageViewerPanel(connectionId, queueName, controller, logger, extensionUri);
    MessageViewerPanel.panels.set(key, instance);
    return instance;
  }

  private async handleMessage(raw: unknown): Promise<void> {
    const result = WebviewToHostSchema.safeParse(raw);
    if (!result.success) {
      this.logger.warn('Invalid message from webview', result.error);
      return;
    }

    const msg = result.data;

    switch (msg.type) {
      case 'ready':
        await this.onReady();
        break;
      case 'ack':
        this.controller.ackMessage(this.connectionId, msg.id);
        break;
      case 'nack':
        this.controller.nackMessage(this.connectionId, msg.id, msg.requeue);
        break;
      case 'replay':
        try {
          await this.controller.replayMessage(this.connectionId, this.queueName, msg.id);
        } catch (err) {
          this.logger.error('Replay failed', err);
          vscode.window.showErrorMessage(`Replay failed: ${String(err)}`);
        }
        break;
      case 'publish':
        try {
          const published = this.controller.publishMessage(
            this.connectionId,
            msg.exchange,
            msg.routingKey,
            Buffer.from(msg.body, 'utf-8'),
            msg.contentType,
          );
          if (!published) {
            vscode.window.showErrorMessage('MQTracker: Publish failed — not connected');
          }
        } catch (err) {
          this.logger.error('Publish failed', err);
          vscode.window.showErrorMessage(`MQTracker: Publish failed — ${String(err)}`);
        }
        break;
    }
  }

  private async onReady(): Promise<void> {
    const session = this.controller.getSession(this.connectionId);
    if (!session) return;

    // Send buffered messages
    const buffer = this.controller.getOrCreateBuffer(this.connectionId, this.queueName);
    const existing = buffer.getAll().map(toWebviewMessage);
    this.panel.webview.postMessage({ type: 'messagesLoaded', messages: existing });

    // Subscribe for new messages
    this.activeConsumerTag = await this.controller.subscribeQueue(
      this.connectionId,
      this.queueName,
      (msg) => this.enqueueForWebview(msg),
    );
  }

  private enqueueForWebview(msg: Message): void {
    this.pendingMessages.push(toWebviewMessage(msg));

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const batch = this.pendingMessages.splice(0);
      if (batch.length > 0) {
        this.panel.webview.postMessage({ type: 'messagesBatch', messages: batch });
      }
    }, MessageViewerPanel.DEBOUNCE_MS);
  }

  private buildHtml(): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js'),
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
    #toolbar { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
    #toolbar input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 8px; border-radius: 2px; }
    #toolbar button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 2px; cursor: pointer; }
    #toolbar button:hover { background: var(--vscode-button-hoverBackground); }
    #main { display: flex; flex: 1; overflow: hidden; }
    #message-list { flex: 1; overflow-y: auto; border-right: 1px solid var(--vscode-panel-border); }
    .msg-row { padding: 6px 12px; cursor: pointer; border-bottom: 1px solid var(--vscode-panel-border, #333); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .msg-row:hover { background: var(--vscode-list-hoverBackground); }
    .msg-row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .msg-row .rk { color: var(--vscode-symbolIcon-stringForeground); margin-right: 8px; }
    .msg-row .ts { color: var(--vscode-descriptionForeground); font-size: 11px; }
    #detail { width: 360px; overflow-y: auto; padding: 12px; flex-shrink: 0; display: none; }
    #detail.visible { display: block; }
    #detail h3 { margin-bottom: 8px; font-size: 13px; }
    #detail pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 2px; font-size: 11px; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; }
    #detail .actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
    #detail .actions button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 4px 10px; border-radius: 2px; cursor: pointer; font-size: 12px; }
    #detail .actions button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    #detail .meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    #empty { padding: 24px; color: var(--vscode-descriptionForeground); text-align: center; }
  </style>
</head>
<body>
  <div id="toolbar">
    <input id="filter-input" type="text" placeholder="Filter by routing key, body, exchange…" />
    <button id="clear-btn">Clear</button>
  </div>
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
      this.controller.unsubscribeQueue(this.connectionId, this.activeConsumerTag).catch(() => undefined);
    }
    this.panel.dispose();
  }
}