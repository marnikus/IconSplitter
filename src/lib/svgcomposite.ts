// svgcomposite.ts — pixel work for numbered, square contact sheets (RULE 1).
// Cells are equal squares; each source is contained, centered and never cropped.

interface GridCell {
  positionId: number;
  x: number;
  y: number;
}

interface GridLayout {
  count: number;
  columns: number;
  rows: number;
  canvasSize: number;
  cellSize: number;
  padding: number;
  emptyCells: number;
  cells: GridCell[];
}

interface FitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ContainRequest {
  sourceWidth: number;
  sourceHeight: number;
  boxSize: number;
  x: number;
  y: number;
}

export function squareGrid(count: number, cellSize = 512, padding = 32): GridLayout {
  if (!validGridCount(count)) throw new RangeError("A batch must contain 1–9 images.");
  if (!validCellSize(cellSize)) throw new RangeError("Cell size must be 64–4096 pixels.");
  if (!validPadding(padding, cellSize)) throw new RangeError("Cell padding must leave a positive image area.");
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const cells = Array.from({ length: count }, (_, i) => ({
    positionId: i + 1, x: i % columns * cellSize, y: Math.floor(i / columns) * cellSize,
  }));
  return { count, columns, rows, canvasSize: columns * cellSize, cellSize, padding,
    emptyCells: columns * columns - count, cells };
}

function validGridCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 9;
}

function validCellSize(cellSize: number): boolean {
  return Number.isInteger(cellSize) && cellSize >= 64 && cellSize <= 4096;
}

function validPadding(padding: number, cellSize: number): boolean {
  return Number.isInteger(padding) && padding >= 0 && padding * 2 < cellSize;
}

export function containRect(request: ContainRequest): FitRect {
  const { sourceWidth, sourceHeight, boxSize, x, y } = request;
  if (![sourceWidth, sourceHeight, boxSize, x, y].every(Number.isFinite)
    || sourceWidth <= 0 || sourceHeight <= 0 || boxSize <= 0) {
    throw new RangeError("Image dimensions and placement must be finite; sizes must be positive.");
  }
  const scale = Math.min(boxSize / sourceWidth, boxSize / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: x + (boxSize - width) / 2, y: y + (boxSize - height) / 2, width, height };
}

export async function createContactSheet(files: File[], cellSize: number, padding: number): Promise<Blob> {
  const layout = squareGrid(files.length, cellSize, padding);
  const canvas = document.createElement("canvas");
  canvas.width = layout.canvasSize;
  canvas.height = layout.canvasSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable; no image was sent.");
  paintBackground(context, layout.canvasSize);
  for (const cell of layout.cells) await drawCell(context, files[cell.positionId - 1], cell, layout);
  return canvasBlob(canvas);
}

async function drawCell(context: CanvasRenderingContext2D, file: File, cell: GridCell, grid: GridLayout): Promise<void> {
  const bitmap = await createImageBitmap(file);
  try {
    const available = grid.cellSize - 2 * grid.padding;
    const fit = containRect({ sourceWidth: bitmap.width, sourceHeight: bitmap.height, boxSize: available,
      x: cell.x + grid.padding, y: cell.y + grid.padding });
    context.drawImage(bitmap, fit.x, fit.y, fit.width, fit.height);
    drawPosition(context, cell.positionId, cell.x, cell.y);
  } finally {
    bitmap.close();
  }
}

function paintBackground(context: CanvasRenderingContext2D, size: number): void {
  context.fillStyle = "#f3f4f6";
  context.fillRect(0, 0, size, size);
}

function drawPosition(context: CanvasRenderingContext2D, id: number, x: number, y: number): void {
  context.fillStyle = "#ffffff";
  context.fillRect(x + 8, y + 8, 32, 32);
  context.fillStyle = "#111827";
  context.font = "bold 20px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(id), x + 24, y + 24);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Contact sheet PNG could not be created.")), "image/png");
  });
}

export async function blobDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
