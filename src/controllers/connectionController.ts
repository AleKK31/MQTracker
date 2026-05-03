import type { Logger } from '../utils/logger';
import type { IManagementApi } from '../core/ports/IManagementApi';
import * as vscode from 'vscode';
import { Connection } from '../core/models/connection';
import { MessageBuffer } from '../core/services/messageBuffer';
import { ReplayService } from '../core/services/replayService';
import { ManagementApiClient } from '../infra/http/managementApiClient';
import { ConfigStore } from '../infra/storage/configStore';
import { AmqpClient } from '../infra/amqp/amqpClient';

export interface ActiveSession {
  connection: Connection;
  amqp: AmqpClient;
  management: IManagementApi;
  buffers: Map<string, MessageBuffer>;
  replayServices: Map<string, ReplayService>;
}

export class ConnectionController {
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly configStore: ConfigStore,
    private readonly logger: Logger,
  ) {}

  async addConnection(connection: Connection, password: string): Promise<void> {
    await this.configStore.saveConnection(connection, password);
    await this.openSession(connection, password);
  }

  async removeConnection(connectionId: string): Promise<void> {
    await this.closeSession(connectionId);
    await this.configStore.removeConnection(connectionId);
  }

  async restoreConnections(): Promise<void> {
    const connections = this.configStore.getConnections();
    for (const conn of connections) {
      const password = await this.configStore.getPassword(conn.id);
      if (password !== undefined) {
        await this.openSession(conn, password);
      }
    }
  }

  getSession(connectionId: string): ActiveSession | undefined {
    return this.sessions.get(connectionId);
  }

  getAllSessions(): ActiveSession[] {
    return Array.from(this.sessions.values());
  }

  getOrCreateBuffer(connectionId: string, queueName: string): MessageBuffer {
    const session = this.sessions.get(connectionId);
    if (!session) throw new Error(`No session for connection ${connectionId}`);

    let buffer = session.buffers.get(queueName);
    if (!buffer) {
      const capacity = vscode.workspace
        .getConfiguration('mqtracker')
        .get<number>('messageBufferCapacity', 500);
      buffer = new MessageBuffer(capacity);
      session.buffers.set(queueName, buffer);

      const replay = new ReplayService(buffer, session.amqp);
      session.replayServices.set(queueName, replay);
    }

    return buffer;
  }

  async subscribeQueue(
    connectionId: string,
    queueName: string,
    onMessage: (msg: import('../core/models/message').Message) => void,
  ): Promise<string> {
    const session = this.sessions.get(connectionId);
    if (!session) throw new Error(`No session for connection ${connectionId}`);

    const buffer = this.getOrCreateBuffer(connectionId, queueName);

    return session.amqp.subscribe(queueName, (msg) => {
      buffer.add(msg);
      onMessage(msg);
    });
  }

  ackMessage(connectionId: string, messageId: string): void {
    const session = this.sessions.get(connectionId);
    session?.amqp.ackById(messageId);
  }

  nackMessage(connectionId: string, messageId: string, requeue = false): void {
    const session = this.sessions.get(connectionId);
    session?.amqp.nackById(messageId, requeue);
  }

  async unsubscribeQueue(connectionId: string, consumerTag: string): Promise<void> {
    const session = this.sessions.get(connectionId);
    if (!session) return;
    await session.amqp.unsubscribe(consumerTag);
  }

  publishMessage(
    connectionId: string,
    exchange: string,
    routingKey: string,
    body: Buffer,
    contentType: string,
  ): boolean {
    const session = this.sessions.get(connectionId);
    if (!session) return false;
    return session.amqp.publish(exchange, routingKey, body, { contentType });
  }

  async replayMessage(connectionId: string, queueName: string, messageId: string): Promise<void> {
    const session = this.sessions.get(connectionId);
    if (!session) throw new Error(`No session for connection ${connectionId}`);
    const replay = session.replayServices.get(queueName);
    if (!replay) throw new Error(`No replay service for queue ${queueName}`);
    await replay.replay(messageId, '');
  }

  async disposeAll(): Promise<void> {
    for (const id of this.sessions.keys()) {
      await this.closeSession(id);
    }
  }

  private async openSession(connection: Connection, password: string): Promise<void> {
    if (this.sessions.has(connection.id)) return;

    const maxDelay = vscode.workspace
      .getConfiguration('mqtracker')
      .get<number>('reconnectMaxDelay', 30_000);

    const amqp = new AmqpClient(connection, password, this.logger, maxDelay);
    amqp.onError((err) => this.logger.error(`Connection ${connection.id} error`, err));

    const management = new ManagementApiClient(connection, password);

    const session: ActiveSession = {
      connection,
      amqp,
      management,
      buffers: new Map(),
      replayServices: new Map(),
    };

    this.sessions.set(connection.id, session);

    try {
      await amqp.connect();
    } catch (err) {
      this.logger.error(`Failed to connect ${connection.id}`, err);
    }
  }

  private async closeSession(connectionId: string): Promise<void> {
    const session = this.sessions.get(connectionId);
    if (!session) return;
    try {
      await session.amqp.disconnect();
    } catch (err) {
      this.logger.warn(`Error disconnecting ${connectionId}`, err);
    }
    this.sessions.delete(connectionId);
  }
}