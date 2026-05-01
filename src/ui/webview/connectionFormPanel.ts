import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Connection } from '../../core/models/connection';

export interface ConnectionFormResult {
  connection: Connection;
  password: string;
}

type FormToHost =
  | { type: 'submit'; fields: Record<string, string> }
  | { type: 'cancel' };

export class ConnectionFormPanel {
  private static instance: ConnectionFormPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private resolve: ((result: ConnectionFormResult | undefined) => void) | undefined;

  private constructor(extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      'tracemq.connectionForm',
      'TraceMQ: Add Connection',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );

    this.panel.webview.html = this.buildHtml();
    this.panel.webview.onDidReceiveMessage((raw: FormToHost) => this.handleMessage(raw));
    this.panel.onDidDispose(() => {
      ConnectionFormPanel.instance = undefined;
      this.resolve?.(undefined);
    });
  }

  static show(extensionUri: vscode.Uri): Promise<ConnectionFormResult | undefined> {
    if (ConnectionFormPanel.instance) {
      ConnectionFormPanel.instance.panel.reveal(vscode.ViewColumn.One);
      return new Promise((resolve) => {
        ConnectionFormPanel.instance!.resolve = resolve;
      });
    }

    const instance = new ConnectionFormPanel(extensionUri);
    ConnectionFormPanel.instance = instance;

    return new Promise((resolve) => {
      instance.resolve = resolve;
    });
  }

  private handleMessage(msg: FormToHost): void {
    if (msg.type === 'cancel') {
      this.resolve?.(undefined);
      this.panel.dispose();
      return;
    }

    if (msg.type === 'submit') {
      const f = msg.fields;
      const connection: Connection = {
        id: uuidv4(),
        name: f['name'] ?? '',
        host: f['host'] ?? 'localhost',
        port: parseInt(f['port'] ?? '5672', 10),
        vhost: f['vhost'] ?? '/',
        username: f['username'] ?? 'guest',
        managementPort: parseInt(f['mgmtPort'] ?? '15672', 10),
        useTls: f['tls'] === 'true',
      };
      this.resolve?.({ connection, password: f['password'] ?? '' });
      this.panel.dispose();
    }
  }

  private buildHtml(): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const csp = this.panel.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${csp};" />
  <title>Add Connection</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      justify-content: center;
      padding: 32px 16px;
    }

    .card {
      width: 100%;
      max-width: 480px;
    }

    h1 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 24px;
      color: var(--vscode-foreground);
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      margin: 20px 0 10px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
    }

    label {
      font-size: 12px;
      color: var(--vscode-foreground);
    }

    input[type="text"],
    input[type="password"],
    input[type="number"] {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 6px 8px;
      border-radius: 2px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      outline: none;
      width: 100%;
    }

    input:focus {
      border-color: var(--vscode-focusBorder);
    }

    input.error {
      border-color: var(--vscode-inputValidation-errorBorder);
    }

    .error-msg {
      font-size: 11px;
      color: var(--vscode-inputValidation-errorForeground, #f48771);
      display: none;
    }

    .field.has-error .error-msg { display: block; }
    .field.has-error input { border-color: var(--vscode-inputValidation-errorBorder, #f48771); }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .toggle-row label {
      cursor: pointer;
      user-select: none;
    }

    input[type="checkbox"] {
      accent-color: var(--vscode-focusBorder);
      width: 14px;
      height: 14px;
      cursor: pointer;
    }

    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 24px;
    }

    button {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      border: none;
      padding: 6px 16px;
      border-radius: 2px;
      cursor: pointer;
    }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  </style>
</head>
<body>
<div class="card">
  <h1>Add RabbitMQ Connection</h1>

  <div class="field" id="f-name">
    <label for="name">Connection name</label>
    <input id="name" type="text" placeholder="My RabbitMQ" autocomplete="off" />
    <span class="error-msg">Required</span>
  </div>

  <div class="section-title">AMQP</div>

  <div class="row">
    <div class="field" id="f-host">
      <label for="host">Host</label>
      <input id="host" type="text" value="localhost" autocomplete="off" />
      <span class="error-msg">Required</span>
    </div>
    <div class="field" id="f-port">
      <label for="port">Port</label>
      <input id="port" type="number" value="5672" min="1" max="65535" />
      <span class="error-msg">1–65535</span>
    </div>
  </div>

  <div class="field" id="f-vhost">
    <label for="vhost">VHost</label>
    <input id="vhost" type="text" value="/" autocomplete="off" />
    <span class="error-msg">Required</span>
  </div>

  <div class="toggle-row">
    <input id="tls" type="checkbox" />
    <label for="tls">Use TLS (amqps://)</label>
  </div>

  <div class="section-title">Credentials</div>

  <div class="row">
    <div class="field" id="f-username">
      <label for="username">Username</label>
      <input id="username" type="text" value="guest" autocomplete="off" />
      <span class="error-msg">Required</span>
    </div>
    <div class="field" id="f-password">
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="new-password" />
      <span class="error-msg">Required</span>
    </div>
  </div>

  <div class="section-title">Management API</div>

  <div class="field" id="f-mgmt">
    <label for="mgmtPort">Management Port</label>
    <input id="mgmtPort" type="number" value="15672" min="1" max="65535" />
    <span class="error-msg">1–65535</span>
  </div>

  <div class="actions">
    <button class="btn-secondary" id="btn-cancel">Cancel</button>
    <button class="btn-primary" id="btn-connect">Connect</button>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  function validate() {
    let ok = true;

    function check(fieldId, inputId, condition) {
      const wrap = document.getElementById(fieldId);
      const val = document.getElementById(inputId).value.trim();
      const pass = condition(val);
      wrap.classList.toggle('has-error', !pass);
      if (!pass) ok = false;
      return val;
    }

    const name     = check('f-name',     'name',     v => v.length > 0);
    const host     = check('f-host',     'host',     v => v.length > 0);
    const port     = check('f-port',     'port',     v => +v >= 1 && +v <= 65535);
    const vhost    = check('f-vhost',    'vhost',    v => v.length > 0);
    const username = check('f-username', 'username', v => v.length > 0);
    const password = check('f-password', 'password', v => v.length > 0);
    const mgmtPort = check('f-mgmt',     'mgmtPort', v => +v >= 1 && +v <= 65535);

    if (!ok) return;

    vscode.postMessage({
      type: 'submit',
      fields: {
        name, host, port, vhost, username, password, mgmtPort,
        tls: document.getElementById('tls').checked ? 'true' : 'false',
      },
    });
  }

  document.getElementById('btn-connect').addEventListener('click', validate);
  document.getElementById('btn-cancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') validate();
    if (e.key === 'Escape') vscode.postMessage({ type: 'cancel' });
  });
</script>
</body>
</html>`;
  }
}
