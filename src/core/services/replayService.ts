import type { Message, MessageId } from '../models/message';
import type { IMessageStore } from '../ports/IMessageStore';
import type { IBrokerClient } from '../ports/IBrokerClient';

export class ReplayService {
  constructor(
    private readonly store: IMessageStore,
    private readonly broker: IBrokerClient,
  ) {}

  async replay(id: MessageId, targetExchange: string, targetRoutingKey?: string): Promise<void> {
    const message = this.store.get(id);
    if (!message) {
      throw new Error(`Message ${id} not found in buffer`);
    }

    const exchange = targetExchange ?? message.exchange;
    const routingKey = targetRoutingKey ?? message.routingKey;
    const content = Buffer.from(message.body, 'utf-8');

    const headers: Record<string, unknown> = {
      ...message.headers,
      'x-mqtracker-replay': true,
      'x-mqtracker-original-id': id,
      'x-mqtracker-replayed-at': new Date().toISOString(),
    };

    this.broker.publish(exchange, routingKey, content, {
      contentType: message.contentType,
      headers,
    });
  }

  replayAll(ids: MessageId[], targetExchange: string, targetRoutingKey?: string): Promise<void[]> {
    return Promise.all(ids.map((id) => this.replay(id, targetExchange, targetRoutingKey)));
  }

  getReplayableMessages(): readonly Message[] {
    return this.store.getAll();
  }
}