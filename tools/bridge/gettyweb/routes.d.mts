export function gettyWebHealth(): { ready: boolean; browser: string; headed: boolean };
export function contributeUrlOf(config: any): string | null;
export function filesFromBody(body: Buffer, config: any): Array<{ name: string; bytes: Buffer }> | null;
export function handleGettyWebUpload(req: any, res: any, post: any, json: any, limit: number): Promise<any>;
export function handleGettyWebTest(req: any, res: any, post: any, json: any): Promise<any>;
export function handleGettyWebFinish(req: any, res: any, post: any, json: any): Promise<any>;
export function handleGettyWebClose(req: any, res: any, post: any, json: any): Promise<any>;
export function sanitizeMetadata(raw: unknown): { title: string; description: string; keywords: string[] } | null;
