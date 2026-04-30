import * as vscode from 'vscode';
import { TreeNode } from './nodes/treeNode';
import type { ConnectionController } from '../../controllers/connectionController';

export class RabbitTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly controller: ConnectionController) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      return this.getRootNodes();
    }

    switch (element.kind) {
      case 'connection': return this.getConnectionChildren(element);
      case 'queues-group': return this.getQueueNodes(element);
      case 'exchanges-group': return this.getExchangeNodes(element);
      default: return [];
    }
  }

  private getRootNodes(): TreeNode[] {
    return this.controller.getAllSessions().map((session) => {
      const node = new TreeNode(
        session.connection.name,
        'connection',
        vscode.TreeItemCollapsibleState.Collapsed,
        session.connection,
        session.connection.id,
      );
      node.description = `${session.connection.host}:${session.connection.port}`;
      node.tooltip = `${session.connection.host}:${session.connection.port}/${session.connection.vhost}`;
      return node;
    });
  }

  private getConnectionChildren(connectionNode: TreeNode): TreeNode[] {
    const connId = connectionNode.connectionId!;
    return [
      new TreeNode('Queues', 'queues-group', vscode.TreeItemCollapsibleState.Collapsed, undefined, connId),
      new TreeNode('Exchanges', 'exchanges-group', vscode.TreeItemCollapsibleState.Collapsed, undefined, connId),
    ];
  }

  private async getQueueNodes(groupNode: TreeNode): Promise<TreeNode[]> {
    const session = this.controller.getSession(groupNode.connectionId!);
    if (!session) return [];

    try {
      const queues = await session.management.getQueues(session.connection.vhost);
      return queues.map((q) => {
        const node = new TreeNode(
          q.name,
          'queue',
          vscode.TreeItemCollapsibleState.None,
          q,
          groupNode.connectionId,
        );
        node.description = `${q.messages} msg`;
        node.tooltip = `${q.messages} messages, ${q.consumers} consumers — ${q.state}`;
        return node;
      });
    } catch (err) {
      return [new TreeNode(`Error: ${String(err)}`, 'queue', vscode.TreeItemCollapsibleState.None)];
    }
  }

  private async getExchangeNodes(groupNode: TreeNode): Promise<TreeNode[]> {
    const session = this.controller.getSession(groupNode.connectionId!);
    if (!session) return [];

    try {
      const exchanges = await session.management.getExchanges(session.connection.vhost);
      return exchanges.map((e) => {
        const node = new TreeNode(
          e.name || '(default)',
          'exchange',
          vscode.TreeItemCollapsibleState.None,
          e,
          groupNode.connectionId,
        );
        node.description = e.type;
        return node;
      });
    } catch (err) {
      return [new TreeNode(`Error: ${String(err)}`, 'exchange', vscode.TreeItemCollapsibleState.None)];
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}