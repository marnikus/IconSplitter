export type FakeEspFailStage = "batch-list-403" | "ingest-422";

export interface FakeEspExpected {
  username: string;
  password: string;
  apiKey?: string;
  apiSecret?: string;
  failStage?: FakeEspFailStage;
}

export interface FakeEspContribution {
  id: string;
  submission_batch_id: string;
  file_name: string;
  mime_type: string;
  raster_file_name: string;
  raster_mime_type: string;
  upload_bucket: string;
}

export interface FakeEspState {
  tokenRequests: number;
  tokenGrants: string[];
  authHeaders: string[];
  batchCreations: number;
  batches: Array<{ id: string; submission_name: string; submission_type: string }>;
  contributions: FakeEspContribution[];
  ingestInitiations: FakeEspContribution[];
  authorizeRequests: Array<{ contributionId: string; partNumber: number; rasterFile: boolean; encryptedPayload: string }>;
  completions: Array<{ contributionId: string; rasterFile: boolean; etags: Array<{ part_number: string; etag: string }> }>;
  uploadedFiles: Map<string, Buffer>;
}

export interface FakeEspServer {
  port: number;
  certSha256: string;
  state: FakeEspState;
  close(): Promise<void>;
}

export function startFakeEspServer(expected: FakeEspExpected): Promise<FakeEspServer>;
