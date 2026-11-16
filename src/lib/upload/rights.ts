// Optional identity claims come only from user input, never metadata generation.
import type { IconMetadata } from "./meta";
export interface MetadataRights { creator?: string; copyright?: string }
export function metadataRights(value: MetadataRights): MetadataRights {
  const rights: MetadataRights = {};
  if (typeof value.creator === "string" && value.creator.trim()) rights.creator = value.creator.trim();
  if (typeof value.copyright === "string" && value.copyright.trim()) rights.copyright = value.copyright.trim();
  return rights;
}
/** Exact core text/order and normalized optional identity, including absence. */
export function sameMetadata(actual: IconMetadata | null, expected: IconMetadata): boolean {
  if (actual === null) return false;
  return actual.title === expected.title && actual.description === expected.description
    && JSON.stringify(actual.tags) === JSON.stringify(expected.tags)
    && JSON.stringify(metadataRights(actual)) === JSON.stringify(metadataRights(expected));
}
