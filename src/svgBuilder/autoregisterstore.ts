// autoregisterstore.ts — the "Automatic register" switch (2026-11-16): register
// templates and artboards after every scan. One localStorage owner, kept apart
// from actions/register.ts so the model can read it without importing actions.
export const AUTO_REGISTER_KEY = "iconSplitter.builder.autoRegister.v1";

export function loadAutoRegister(): boolean {
  try { return localStorage.getItem(AUTO_REGISTER_KEY) === "1"; } catch { return false; }
}

export function saveAutoRegister(on: boolean): void {
  try { localStorage.setItem(AUTO_REGISTER_KEY, on ? "1" : "0"); } catch { /* private mode: this run only */ }
}
