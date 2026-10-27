import { HOST_NAME } from "../src/lib/stockupload/protocol";
import type { MessagePortLike } from "../src/lib/stockupload/native";
interface PagePort extends MessagePortLike { name: string; sender?: { id?: string; url?: string; tab?: { id?: number } } }
interface ExtensionChrome {
  runtime: { id: string; getURL(path: string): string; onConnect: { addListener(fn: (port: PagePort) => void): void }; connectNative(name: string): MessagePortLike };
  action: { onClicked: { addListener(fn: () => void): void } };
  tabs: { create(options: { url: string }): void };
}
const api = (globalThis as unknown as { chrome: ExtensionChrome }).chrome;
let owned: PagePort | null = null;
api.action.onClicked.addListener(() => api.tabs.create({ url: api.runtime.getURL("index.html") }));
api.runtime.onConnect.addListener(page => {
  if (!allowed(page) || owned) { page.disconnect(); return; }
  owned = page;
  const host = api.runtime.connectNative(HOST_NAME);
  page.onMessage.addListener(message => host.postMessage(message));
  host.onMessage.addListener(message => page.postMessage(message));
  page.onDisconnect.addListener(() => { if (owned === page) owned = null; host.disconnect(); });
  host.onDisconnect.addListener(() => { if (owned === page) owned = null; page.disconnect(); });
});
function allowed(page: PagePort): boolean {
  return page.name === HOST_NAME && page.sender?.id === api.runtime.id
    && page.sender.url === api.runtime.getURL("index.html") && typeof page.sender.tab?.id === "number";
}
