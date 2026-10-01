// fs.ts owns the File System Access boundary: handles, unique names, reads,
// writes, folder picking, image decoding. No `any`; narrow error checks.

export interface FsFile {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export interface FsWritable {
  write(data: Blob | ArrayBuffer | string): Promise<void>;
  close(): Promise<void>;
}

export interface FsFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<FsFile>;
  createWritable(): Promise<FsWritable>;
}

export interface FsDirHandle {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterable<FsFileHandle | FsDirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>;
}

export type FileData = Blob | ArrayBuffer | string;

function isDomError(e: unknown, want: string): boolean {
  if (typeof e !== "object" || e === null) return false;
  return (e as { name?: unknown }).name === want;
}

export function isNotFound(e: unknown): boolean {
  return isDomError(e, "NotFoundError");
}

function isAbort(e: unknown): boolean {
  return isDomError(e, "AbortError");
}

export async function tryGetFile(dir: FsDirHandle, name: string): Promise<FsFileHandle | null> {
  try {
    return await dir.getFileHandle(name);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function tryGetDir(dir: FsDirHandle, name: string): Promise<FsDirHandle | null> {
  try {
    return await dir.getDirectoryHandle(name);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function ensureDir(parent: FsDirHandle, name: string): Promise<FsDirHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

export async function ensureFirstFreeDir(
  parent: FsDirHandle,
  candidates: string[],
): Promise<{ handle: FsDirHandle; name: string }> {
  for (const name of candidates) {
    if (await tryGetDir(parent, name)) continue;
    return { handle: await ensureDir(parent, name), name };
  }
  throw new Error("No free folder name available");
}

export async function writeFile(dir: FsDirHandle, name: string, data: FileData): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const out = await handle.createWritable();
  await out.write(data);
  await out.close();
}

export async function writeFirstFree(dir: FsDirHandle, candidates: string[], data: FileData): Promise<string> {
  for (const name of candidates) {
    if (await tryGetFile(dir, name)) continue;
    await writeFile(dir, name, data);
    return name;
  }
  throw new Error("No free file name available");
}

export async function readTextFile(dir: FsDirHandle, name: string): Promise<string | null> {
  const handle = await tryGetFile(dir, name);
  if (!handle) return null;
  try {
    return await (await handle.getFile()).text();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

interface PickerWindow {
  showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FsDirHandle>;
}

function pickerWindow(): PickerWindow | null {
  if (typeof window === "undefined") return null;
  return window as unknown as PickerWindow;
}

export function canPickFolders(): boolean {
  return typeof pickerWindow()?.showDirectoryPicker === "function";
}

export function pickFolder(): Promise<FsDirHandle | null> {
  const w = pickerWindow();
  if (!w?.showDirectoryPicker) return Promise.resolve(null);
  return w.showDirectoryPicker({ mode: "readwrite" }).then(
    (h) => h,
    (e: unknown) => {
      if (isAbort(e)) return null;
      throw e;
    },
  );
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("Could not read image"));
    };
    img.src = url;
  });
}

export function loadImageFromFile(file: FsFile): Promise<HTMLImageElement> {
  return file.arrayBuffer().then(
    (buf) => loadImageFromUrl(URL.createObjectURL(new Blob([buf], { type: file.type }))),
    () => {
      throw new Error("Could not read image");
    },
  );
}
