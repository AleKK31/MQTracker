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
      case 'exchange': return this.getBindingNodes(element);
      case 'queue': return this.getConsumerNodes(element);
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
        const collapsible = q.consumers > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
        const node = new TreeNode(q.name, 'queue', collapsible, q, groupNode.connectionId);
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
          vscode.TreeItemCollapsibleState.Collapsed,
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

  private async getConsumerNodes(queueNode: TreeNode): Promise<TreeNode[]> {
    const session = this.controller.getSession(queueNode.connectionId!);
    if (!session) return [];

    try {
      const allConsumers = await session.management.getConsumers(session.connection.vhost);
      const queue = queueNode.payload as import('../../core/models/queue').Queue;
      const consumers = allConsumers.filter((c) => c.queueName === queue.name);

      if (consumers.length === 0) {
        return [new TreeNode('No consumers', 'consumer', vscode.TreeItemCollapsibleState.None)];
      }

      return consumers.map((c) => {
        const node = new TreeNode(c.consumerTag, 'consumer', vscode.TreeItemCollapsibleState.None, undefined, queueNode.connectionId);
        node.description = c.channelUser;
        node.tooltip = `Tag: ${c.consumerTag} | User: ${c.channelUser} | Ack: ${c.ackMode} | Active: ${c.active}`;
        return node;
      });
    } catch (err) {
      return [new TreeNode(`Error: ${String(err)}`, 'consumer', vscode.TreeItemCollapsibleState.None)];
    }
  }

  private async getBindingNodes(exchangeNode: TreeNode): Promise<TreeNode[]> {
    const session = this.controller.getSession(exchangeNode.connectionId!);
    if (!session) return [];

    try {
      const allBindings = await session.management.getBindings(session.connection.vhost);
      const exchange = exchangeNode.payload as import('../../core/models/exchange').Exchange;
      const bindings = allBindings.filter((b) => b.source === exchange.name);

      if (bindings.length === 0) {
        return [new TreeNode('No bindings', 'binding', vscode.TreeItemCollapsibleState.None)];
      }

      return bindings.map((b) => {
        const label = b.routingKey || '(empty)';
        const node = new TreeNode(label, 'binding', vscode.TreeItemCollapsibleState.None, b, exchangeNode.connectionId);
        node.description = `→ ${b.destination}`;
        node.tooltip = `${b.source} → ${b.destination} (${b.destinationType}) via "${b.routingKey}"`;
        return node;
      });
    } catch (err) {
      return [new TreeNode(`Error: ${String(err)}`, 'binding', vscode.TreeItemCollapsibleState.None)];
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}