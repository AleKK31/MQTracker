export interface QueueConsumer {
  consumerTag: string;
  queueName: string;
  vhost: string;
  exclusive: boolean;
  ackMode: 'auto' | 'manual' | 'none';
  active: boolean;
  channelUser: string;
}
