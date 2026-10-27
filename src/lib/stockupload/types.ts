import type { FileHandleLike } from "../fs";
import type { IconMetadata } from "../upload/meta";
export const STOCK_KINDS = ["jpg", "png", "svg", "eps", "zip"] as const;
export type StockKind = typeof STOCK_KINDS[number];
export interface StockArtifact { kind: StockKind; name: string; path: string; bytes: number; hash: string; handle?: FileHandleLike }
export interface StockPackage { id: string; pairId: string; name: string; dir: string; recordText: string; metadata: IconMetadata; artifacts: StockArtifact[]; warning: string }
export interface FormatSelection { raster: boolean; svg: boolean; eps: boolean; zip: boolean }
export interface TransferFile { id: string; name: string; bytes: number; hash: string; kind: "jpg" | "eps" }
export interface TransferManifest { v: 1; job: string; account: "shutterstock"; files: TransferFile[]; epsReviewed: boolean }
export interface TransferPlan { files: StockArtifact[]; excluded: string[]; bytes: number }
export interface TransferReceipt { name: string; hash: string; state: "transferred" | "failed" | "uncertain" | "cancelled"; detail?: string }
