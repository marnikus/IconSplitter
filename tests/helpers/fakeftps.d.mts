export const FAKE_FTPS_CERT_SHA256: string;

export interface FakeFtpsServer {
  host: string;
  port: number;
  uploaded: Map<string, Uint8Array>;
  getLogins: () => number;
  close: () => Promise<void>;
}

export function startFakeFtpsServer(opts?: {
  username?: string;
  password?: string;
}): Promise<FakeFtpsServer>;
