interface Metadata { title: string; description: string; tags: string[]; creator?: string; copyright?: string }
export function readStockFile(bytes: Uint8Array): { kind: "JPEG" | "EPS"; metadata: Metadata; iptc: Metadata | null; carriers: string[] };
