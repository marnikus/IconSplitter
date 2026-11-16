export interface EspIngestionFile { name: string; bytes: Buffer }
export interface EspIngestionInput {
  batchId: string | number;
  bucket: string;
  vector?: EspIngestionFile;
  raster: EspIngestionFile;
  sendApi: (method: string, path: string, body?: any) => Promise<any>;
  sendChunk: (url: string, bytes: Buffer, headers: Record<string, string>) => Promise<string>;
}
export function uploadEspContribution(input: EspIngestionInput): Promise<string | number>;
