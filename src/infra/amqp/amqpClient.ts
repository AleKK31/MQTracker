import * as amqplib from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import type { IBrokerClient, MessageHandler, ErrorHandler } from '../../core/ports/IBrokerClient';
import type { Message } from '../../core/models/message';
import type { Connection } from '../../core/models/connection';
import type { Logger } from '../../utils/logger';

export class AmqpClient implements IBrokerClient {
  private model: amqplib.ChannelModel | null = null;
  private channel: amqplib.Channel | null = null;
  private attemptCount = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  private errorHandlers: ErrorHandler[] = [];
  /** Maps message id → deliveryTag; deliveryTag never leaves this class */
  private readonly deliveryTagMap = new Map<string, bigint>();

  constructor(
    private readonly config: Connection,
    private readonly password: string,
    private readonly logger: Logger,
    private readonly maxDelayMs = 30_000,
  ) {}

  get isConnected(): boolean {
    return this.channel !== null && this.model !== null;
  }

  async connect(): Promise<void> {
    this.destroyed = false;
    await this.doConnect();
  }

  private async doConnect(): Promise<void> {
    try {
      const url = this.buildUrl();
      this.model = await amqplib.connect(url);
      this.channel = await this.model.createChannel();
      this.attemptCount = 0;
      this.logger.info(`AmqpClient connected to ${this.config.host}:${this.config.port}`);

      this.model.on('error', (err: Error) => this.handleConnectionError(err));
      this.model.on('close', () => this.handleConnectionClose());
    } catch (err) {
      this.logger.error('AmqpClient connect failed', err);
      this.scheduleReconnect();
    }
  }

  private buildUrl(): string {
    const proto = this.config.useTls ? 'amqps' : 'amqp';
    const vhost = encodeURIComponent(this.config.vhost);
    return `${proto}://${encodeURIComponent(this.config.username)}:${encodeURIComponent(this.password)}@${this.config.host}:${this.config.port}/${vhost}`;
  }

  private handleConnectionError(err: Error): void {
    this.logger.error('AmqpClient connection error', err);
    this.errorHandlers.forEach((h) => h(err));
  }

  private handleConnectionClose(): void {
    if (!this.destroyed) {
      this.logger.warn('AmqpClient connection closed unexpectedly, scheduling reconnect');
      this.model = null;
      this.channel = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const delay = Math.min(this.maxDelayMs, 1000 * Math.pow(2, this.attemptCount));
    this.attemptCount++;
    this.logger.info(`AmqpClient reconnect in ${delay}ms (attempt ${this.attemptCount})`);
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      await this.channel?.close();
      await this.model?.close();
    } catch {
      // ignore errors on graceful close
    } finally {
      this.channel = null;
      this.model = null;
      this.deliveryTagMap.clear();
    }
  }

  async subscribe(queueName: string, handler: MessageHandler): Promise<string> {
    if (!this.channel) throw new Error('Not connected');

    const { consumerTag } = await this.channel.consume(queueName, (msg) => {
      if (!msg) return;
      const id = uuidv4();
      this.deliveryTagMap.set(id, BigInt(msg.fields.deliveryTag));
      const message = this.convertMessage(id, queueName, msg);
      handler(message);
    });

    return consumerTag;
  }

  async unsubscribe(consumerTag: string): Promise<void> {
    await this.channel?.cancel(consumerTag);
  }

  ack(deliveryTag: bigint): void {
    if (!this.channel) return;
    this.channel.ack({ fields: { deliveryTag: Number(deliveryTag) } } as amqplib.Message);
  }

  nack(deliveryTag: bigint, requeue = false): void {
    if (!this.channel) return;
    this.channel.nack({ fields: { deliveryTag: Number(deliveryTag) } } as amqplib.Message, false, requeue);
  }

  ackById(messageId: string): void {
    const tag = this.deliveryTagMap.get(messageId);
    if (tag !== undefined) {
      this.ack(tag);
      this.deliveryTagMap.delete(messageId);
    }
  }

  nackById(messageId: string, requeue = false): void {
    const tag = this.deliveryTagMap.get(messageId);
    if (tag !== undefined) {
      this.nack(tag, requeue);
      this.deliveryTagMap.delete(messageId);
    }
  }

  publish(exchange: string, routingKey: string, content: Buffer, options?: Record<string, unknown>): boolean {
    if (!this.channel) return false;
    return this.channel.publish(exchange, routingKey, content, options as amqplib.Options.Publish);
  }

  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  private convertMessage(id: string, queueName: string, msg: amqplib.ConsumeMessage): Message {
    return {
      id,
      queueName,
      exchange: msg.fields.exchange,
      routingKey: msg.fields.routingKey,
      contentType: msg.properties.contentType ?? 'application/octet-stream',
      body: msg.content.toString('utf-8'),
      headers: (msg.properties.headers as Record<string, unknown>) ?? {},
      timestamp: msg.properties.timestamp
        ? new Date(msg.properties.timestamp * 1000)
        : new Date(),
      redelivered: msg.fields.redelivered,
    };
  }
}