import { AsyncEntry } from "@napi-rs/keyring";
export interface StockCredentials { username: string; password: string }
function entry(): AsyncEntry {
  return new AsyncEntry("IconSplitter Stock Upload", "shutterstock", { linux: { store: "secret-service" } });
}
export async function saveCredentials(raw: StockCredentials): Promise<void> {
  if (!raw.username.trim() || !raw.password || raw.username.length > 512 || raw.password.length > 4096) throw new Error("Both account fields are required");
  await entry().setPassword(JSON.stringify(raw));
}
export async function readCredentials(): Promise<StockCredentials> {
  const text = await entry().getPassword();
  if (!text) throw new Error("Account not saved in OS credential store");
  const parsed = JSON.parse(text) as StockCredentials;
  if (typeof parsed.username !== "string" || typeof parsed.password !== "string") throw new Error("Invalid account storage");
  return parsed;
}
export async function forgetCredentials(): Promise<void> { await entry().deletePassword(); }
