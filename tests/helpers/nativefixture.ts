import { runHost } from "../../companion/src/runtime";
import { HostSession } from "../../companion/src/session";
import { ReceiptJournal } from "../../companion/src/storage";
import { encodeFrame } from "../../companion/src/framing";
import type { StockTransport } from "../../companion/src/job";
let release: (() => void) | null = null;
const transport: StockTransport = {
  upload: async () => {
    process.stdout.write(encodeFrame({ event: "progress", bytes: 1, rss: process.memoryUsage().rss }));
    if (process.argv[3] === "hang") await new Promise<void>(resolve => { release = resolve; });
    return { state: process.argv[3] === "hang" ? "uncertain" : "transferred" };
  },
  close: () => { release?.(); },
};
runHost(new HostSession(transport, { save: async () => undefined, forget: async () => undefined }, new ReceiptJournal(process.argv[2])));
