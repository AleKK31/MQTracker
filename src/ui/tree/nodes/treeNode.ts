import * as vscode from 'vscode';
import { Binding } from '../../../core/models/binding';
import { Exchange } from '../../../core/models/exchange';
import { Queue } from '../../../core/models/queue';
import { Connection } from '../../../core/models/connection';

export type TreeNodeKind = 'connection' | 'queues-group' | 'exchanges-group' | 'queue' | 'exchange' | 'binding' | 'consumer';

export class TreeNode extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly kind: TreeNodeKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly payload?: Connection | Queue | Exchange | Binding | string,
    public readonly connectionId?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = kind;
    this.iconPath = iconForKind(kind);
    if (kind === 'queue') {
      this.command = {
        command: 'mqtracker.openMessageViewer',
        title: 'Open Message Viewer',
        arguments: [{ kind, connectionId, payload }],
      };
    }
  }
}

function iconForKind(kind: TreeNodeKind): vscode.ThemeIcon {
  switch (kind) {
    case 'connection': return new vscode.ThemeIcon('plug');
    case 'queues-group': return new vscode.ThemeIcon('list-unordered');
    case 'exchanges-group': return new vscode.ThemeIcon('arrow-swap');
    case 'queue': return new vscode.ThemeIcon('inbox');
    case 'exchange': return new vscode.ThemeIcon('broadcast');
    case 'binding': return new vscode.ThemeIcon('link');
    case 'consumer': return new vscode.ThemeIcon('person');
  }
}

