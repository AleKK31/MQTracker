export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  vhost: string;
  username: string;
  managementPort: number;
  useTls: boolean;
}

export type ConnectionId = string;