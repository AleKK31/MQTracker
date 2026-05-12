import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { ConfigStore } from './infra/storage/configStore';
import { ConnectionController } from './controllers/connectionController';
import { RabbitTreeProvider } from './ui/tree/rabbitTreeProvider';
import { registerCommands } from './ui/commands/registerCommands';
import { HistoryStore } from './infra/storage/historyStore';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('MQTracker');
  const logger = new Logger(outputChannel);
  context.subscriptions.push(outputChannel);

  logger.info('MQTracker activating…');

  const configStore = new ConfigStore(context.secrets, context.globalState);
  const controller = new ConnectionController(configStore, logger);
  const treeProvider = new RabbitTreeProvider(controller);
  const historyStore = new HistoryStore(context.globalStorageUri.fsPath);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('mqtracker.connections', treeProvider),
    { dispose: () => historyStore.close() },
  );

  registerCommands(context, controller, treeProvider, logger, historyStore);

  // Restore persisted connections
  try {
    await controller.restoreConnections();
    treeProvider.refresh();
  } catch (err) {
    logger.error('Failed to restore connections', err);
  }

  const pollInterval = setInterval(() => {
    if (controller.hasActiveSessions()) {
      treeProvider.refresh();
    }
  }, 5_000);

  context.subscriptions.push({ dispose: () => clearInterval(pollInterval) });

  logger.info('MQTracker activated');
}

export async function deactivate(): Promise<void> {
  // Disposables registered in context.subscriptions are cleaned up by VS Code.
}