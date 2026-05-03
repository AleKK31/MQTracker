import * as vscode from 'vscode';
import type { Connection } from '../../core/models/connection';

const CONNECTIONS_KEY = 'mqtracker.connections';

export class ConfigStore {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly state: vscode.Memento,
  ) {}

  async saveConnection(connection: Connection, password: string): Promise<void> {
    const connections = this.getConnections();
    const idx = connections.findIndex((c) => c.id === connection.id);
    if (idx >= 0) {
      connections[idx] = connection;
    } else {
      connections.push(connection);
    }
    await this.state.update(CONNECTIONS_KEY, connections);
    await this.secrets.store(this.passwordKey(connection.id), password);
  }

  async removeConnection(id: string): Promise<void> {
    const connections = this.getConnections().filter((c) => c.id !== id);
    await this.state.update(CONNECTIONS_KEY, connections);
    await this.secrets.delete(this.passwordKey(id));
  }

  getConnections(): Connection[] {
    return this.state.get<Connection[]>(CONNECTIONS_KEY, []);
  }

  async getPassword(connectionId: string): Promise<string | undefined> {
    return this.secrets.get(this.passwordKey(connectionId));
  }

  private passwordKey(connectionId: string): string {
    return `mqtracker.password.${connectionId}`;
  }
}

