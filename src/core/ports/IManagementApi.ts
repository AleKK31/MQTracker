import { Binding } from "../models/binding";
import { Exchange } from "../models/exchange";
import { Queue } from "../models/queue";

export interface BrokerOverview {
  rabbitmqVersion: string;
  erlangVersion: string;
  clusterName: string;
  totalQueues: number;
  totalConnections: number;
}

export interface IManagementApi {
  getOverview(): Promise<BrokerOverview>;
  getQueues(vhost?: string): Promise<Queue[]>;
  getExchanges(vhost?: string): Promise<Exchange[]>;
  getBindings(vhost?: string): Promise<Binding[]>;
}