import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { ConnectionController } from '../../controllers/connectionController';
import { Queue } from '../../core/models/queue';
import { ConsumerScanner } from '../../core/services/consumerScanner';
import { Logger } from '../../utils/logger';
import { TreeNode } from '../tree/nodes/treeNode';
import { RabbitTreeProvider } from '../tree/rabbitTreeProvider';
import { MessageViewerPanel } from '../webview/messageViewerPanel';
import { Connection } from '../../core/models/connection';

export function registerCommands(
  context: vscode.ExtensionContext,
  controller: ConnectionController,
  treeProvider: RabbitTreeProvider,
  logger: Logger,
): void {
  const cmds: [string, (...args: unknown[]) => unknown][] = [
    ['tracemq.addConnection', () => addConnection(controller, treeProvider)],
    ['tracemq.refresh', () => treeProvider.refresh()],
    ['tracemq.removeConnection', (node) => removeConnection(node as TreeNode, controller, treeProvider)],
    ['tracemq.openMessageViewer', (node) => openMessageViewer(node as TreeNode, controller, logger, context.extensionUri)],
    ['tracemq.publishMessage', (node) => publishMessage(node as TreeNode, controller)],
    ['tracemq.openConsumerInCode', (node) => openConsumerInCode(node as TreeNode)],
  ];

  for (const [id, handler] of cmds) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }
}

async function addConnection(
  controller: ConnectionController,
  treeProvider: RabbitTreeProvider,
): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'Connection name', placeHolder: 'My RabbitMQ' });
  if (!name) return;

  const host = await vscode.window.showInputBox({ prompt: 'Host', value: 'localhost' });
  if (!host) return;

  const portStr = await vscode.window.showInputBox({ prompt: 'AMQP Port', value: '5672' });
  if (!portStr) return;

  const vhost = await vscode.window.showInputBox({ prompt: 'VHost', value: '/' });
  if (!vhost) return;

  const username = await vscode.window.showInputBox({ prompt: 'Username', value: 'guest' });
  if (!username) return;

  const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
  if (password === undefined) return;

  const mgmtPortStr = await vscode.window.showInputBox({ prompt: 'Management Port', value: '15672' });
  if (!mgmtPortStr) return;

  const connection: Connection = {
    id: uuidv4(),
    name,
    host,
    port: parseInt(portStr, 10),
    vhost,
    username,
    managementPort: parseInt(mgmtPortStr, 10),
    useTls: false,
  };

  try {
    await controller.addConnection(connection, password);
    treeProvider.refresh();
    vscode.window.showInformationMessage(`TraceMQ: Connected to ${name}`);
  } catch (err) {
    vscode.window.showErrorMessage(`TraceMQ: Connection failed — ${String(err)}`);
  }
}

async function removeConnection(
  node: TreeNode,
  controller: ConnectionController,
  treeProvider: RabbitTreeProvider,
): Promise<void> {
  if (!node?.connectionId) return;
  const confirm = await vscode.window.showWarningMessage(
    `Remove connection "${node.label}"?`,
    { modal: true },
    'Remove',
  );
  if (confirm !== 'Remove') return;
  await controller.removeConnection(node.connectionId);
  treeProvider.refresh();
}

function openMessageViewer(
  node: TreeNode,
  controller: ConnectionController,
  logger: Logger,
  extensionUri: vscode.Uri,
): void {
  if (node?.kind !== 'queue' || !node.connectionId) return;
  const queue = node.payload as Queue;
  MessageViewerPanel.show(node.connectionId, queue.name, controller, logger, extensionUri);
}

async function publishMessage(node: TreeNode, controller: ConnectionController): Promise<void> {
  const session = node?.connectionId ? controller.getSession(node.connectionId) : undefined;
  if (!session) {
    vscode.window.showErrorMessage('TraceMQ: Select a connection node first');
    return;
  }

  const exchange = await vscode.window.showInputBox({ prompt: 'Exchange', value: '' });
  if (exchange === undefined) return;

  const routingKey = await vscode.window.showInputBox({ prompt: 'Routing Key', value: '' });
  if (routingKey === undefined) return;

  const body = await vscode.window.showInputBox({ prompt: 'Message body', value: '{}' });
  if (body === undefined) return;

  const published = session.amqp.publish(exchange, routingKey, Buffer.from(body, 'utf-8'), {
    contentType: 'application/json',
  });

  if (published) {
    vscode.window.showInformationMessage(`TraceMQ: Message published to ${exchange || '(default)'}/${routingKey}`);
  } else {
    vscode.window.showErrorMessage('TraceMQ: Publish failed — not connected');
  }
}

async function openConsumerInCode(node: TreeNode): Promise<void> {
  if (node?.kind !== 'queue') return;
  const queue = node.payload as Queue;
  const scanner = new ConsumerScanner();
  const patterns = scanner.buildPatterns(queue.name);

  const files = await vscode.workspace.findFiles(
    '**/*.{ts,js,py,java,go,cs,rb}',
    '**/node_modules/**',
    200,
  );

  const matches: vscode.Location[] = [];

  for (const fileUri of files) {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const lines = doc.getText().split('\n');
    const results = scanner.scanLines(lines, fileUri.fsPath, { queueName: queue.name, extraPatterns: patterns });
    for (const r of results) {
      matches.push(new vscode.Location(fileUri, new vscode.Position(r.line, r.column)));
    }
  }

  if (matches.length === 0) {
    vscode.window.showInformationMessage(`TraceMQ: No consumers found for queue "${queue.name}"`);
    return;
  }

  if (matches.length === 1) {
    await vscode.window.showTextDocument(matches[0].uri, {
      selection: new vscode.Range(matches[0].range.start, matches[0].range.start),
    });
    return;
  }

  await vscode.commands.executeCommand('editor.action.showReferences',
    matches[0].uri,
    matches[0].range.start,
    matches,
  );
}