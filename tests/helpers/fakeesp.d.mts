export interface FakeEspExpected {
  username: string;
  password: string;
  apiKey?: string;
  apiSecret?: string;
}

export interface FakeEspState {
  tokenRequests: number;
  batchCreations: number;
  batches: Array<{ id: string; submission_name: string; submission_type: string }>;
  contributions: Array<{ id: string; submission_batch_id: string; file_name: string; mime_type: string; storage_url: string }>;
  uploadedFiles: Map<string, Buffer>;
}

export interface FakeEspServer {
  port: number;
  certSha256: string;
  state: FakeEspState;
  close(): Promise<void>;
}

export function startFakeEspServer(expected: FakeEspExpected): Promise<FakeEspServer>;
