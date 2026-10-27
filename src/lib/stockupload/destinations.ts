/** Descriptors are shipped policy, never arbitrary URLs from imported JSON. */
export const STOCK_DESTINATIONS = [{ id: "shutterstock", name: "Shutterstock", kinds: ["jpg", "eps"], host: "ftps.shutterstock.com", port: 21 }] as const;
export function readDestinations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ["shutterstock"];
  return [...new Set(raw.filter((id): id is string => id === "shutterstock"))];
}
