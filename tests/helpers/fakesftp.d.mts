export interface FakeSftpServer {
  host: string;
  port: number;
  hostKeySha256: string;
  uploaded: Map<string, Uint8Array>;
  getLogins: () => number;
  close: () => Promise<void>;
}

export function startFakeSftpServer(opts?: {
  username?: string;
  password?: string;
}): Promise<FakeSftpServer>;
