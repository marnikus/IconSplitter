// actions/folder.ts — the one picker and the one honest rescan path.
import { pickFolderFor } from "../../ui/pickroot";
import { retryCapture } from "../../ui/rootcapture";
import { scanBuilderRoot, rememberBuilderRoot } from "../scan";
import type { BuilderActionContext, BuilderActions } from "../actiontypes";

export function folderActions(get: () => BuilderActionContext): Pick<BuilderActions, "openFolder" | "rescan"> {
  return {
    openFolder: () => { void open(get()); },
    rescan: () => { void rescan(get()); },
  };
}

async function open(ctx: BuilderActionContext): Promise<void> {
  try {
    const picked = await pickFolderFor(async (handle) => {
      await rememberBuilderRoot(handle);
      ctx.setRoot(handle);
      await scanBuilderRoot(ctx.scanRefs, handle, setters(ctx));
    });
    if (picked?.message) ctx.say(picked.message);
  } catch {
    ctx.say("Open folder failed — the picker or the folder may be unavailable", true);
  }
}

async function rescan(ctx: BuilderActionContext): Promise<void> {
  const root = ctx.model.root;
  if (root === null) return ctx.say("No folder is open — nothing to rescan", true);
  const captured = await retryCapture(root);
  if (captured !== null) ctx.say(captured);
  await scanBuilderRoot(ctx.scanRefs, root, setters(ctx));
}

function setters(ctx: BuilderActionContext) {
  return { setRoot: ctx.setRoot, setDiscovery: ctx.setDiscovery, setBusy: ctx.setBusy, say: ctx.say };
}
