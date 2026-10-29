export function gettyWebHealth(): { ready: boolean; browser: string; headed: boolean };
export function contributeUrlOf(config: any): string | null;
export function iconsFromConfig(config: any): Array<{ files: any[]; metadata: { title: string; description: string; keywords: string[] } | null }> | null;
export function iconsFromBody(body: Buffer, config: any): Array<{ files: Array<{ name: string; bytes: Buffer }>; metadata: { title: string; description: string; keywords: string[] } | null }> | null;
export function handleGettyWebUpload(req: any, res: any, post: any, json: any, limit: number): Promise<any>;
export function handleGettyWebTest(req: any, res: any, post: any, json: any): Promise<any>;
export function handleGettyWebFinish(req: any, res: any, post: any, json: any): Promise<any>;
export function handleGettyWebClose(req: any, res: any, post: any, json: any): Promise<any>;
export function sanitizeMetadata(raw: unknown): { title: string; description: string; keywords: string[] } | null;
