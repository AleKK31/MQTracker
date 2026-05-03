import * as vscode from 'vscode';
import { ConnectionController } from '../../controllers/connectionController';
import { Queue } from '../../core/models/queue';
import { ConsumerScanner } from '../../core/services/consumerScanner';
import { Logger } from '../../utils/logger';
import { TreeNode } from '../tree/nodes/treeNode';
import { RabbitTreeProvider } from '../tree/rabbitTreeProvider';
import { MessageViewerPanel } from '../webview/messageViewerPanel';
import { ConnectionFormPanel } from '../webview/connectionFormPanel';

export function registerCommands(
  context: vscode.ExtensionContext,
  controller: ConnectionController,
  treeProvider: RabbitTreeProvider,
  logger: Logger,
): void {
  const cmds: [string, (...args: unknown[]) => unknown][] = [
    ['mqtracker.addConnection', () => addConnection(context.extensionUri, controller, treeProvider)],
    ['mqtracker.refresh', () => treeProvider.refresh()],
    ['mqtracker.removeConnection', (node) => removeConnection(node as TreeNode, controller, treeProvider)],
    ['mqtracker.openMessageViewer', (node) => openMessageViewer(node as TreeNode, controller, logger, context.extensionUri)],
    ['mqtracker.publishMessage', (node) => publishMessage(node as TreeNode, controller)],
    ['mqtracker.openConsumerInCode', (node) => openConsumerInCode(node as TreeNode)],
  ];

  for (const [id, handler] of cmds) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }
}

async function addConnection(
  extensionUri: vscode.Uri,
  controller: ConnectionController,
  treeProvider: RabbitTreeProvider,
): Promise<void> {
  const result = await ConnectionFormPanel.show(extensionUri);
  if (!result) return;

  try {
    await controller.addConnection(result.connection, result.password);
    treeProvider.refresh();
    vscode.window.showInformationMessage(`MQTracker: Connected to ${result.connection.name}`);
  } catch (err) {
    vscode.window.showErrorMessage(`MQTracker: Connection failed — ${String(err)}`);
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
    vscode.window.showErrorMessage('MQTracker: Select a connection node first');
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
    vscode.window.showInformationMessage(`MQTracker: Message published to ${exchange || '(default)'}/${routingKey}`);
  } else {
    vscode.window.showErrorMessage('MQTracker: Publish failed — not connected');
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
    vscode.window.showInformationMessage(`MQTracker: No consumers found for queue "${queue.name}"`);
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