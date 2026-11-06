// Getty ESP multipart ingestion workflow. Transports are supplied by the bridge.
import { createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";

const CHUNK_SIZE = 10 * 1024 * 1024;
const INGESTION = "/esp/ingestion/v1/contributions";

function assertFile(file, extension) {
  if (!file || typeof file.name !== "string" || !(extension === ".jpg" ? /\.jpe?g$/i.test(file.name) : file.name.toLowerCase().endsWith(extension))
    || !Buffer.isBuffer(file.bytes) || file.bytes.length === 0) {
    throw new Error(`Getty ESP requires a nonempty ${extension} file`);
  }
}

function validateInput(input) {
  assertFile(input.raster, ".jpg");
  if (input.vector) assertFile(input.vector, ".eps");
  if (!input.batchId || !input.bucket) throw new Error("Getty ESP requires a batch and upload bucket");
}

function initiationPayload(input) {
  const payload = {
    submission_batch_id: input.batchId,
    upload_bucket: input.bucket,
    raster_file_name: input.raster.name,
    raster_mime_type: "image/jpeg",
  };
  if (input.vector) {
    payload.file_name = input.vector.name;
    payload.mime_type = "application/postscript";
  }
  return payload;
}

function checkedUploadTarget(data) {
  let url;
  try { url = new URL(data?.upload_url); } catch { throw new Error("Getty ESP returned an invalid upload URL"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Getty ESP upload URL must use HTTPS");
  if (!data.headers || typeof data.headers !== "object" || Array.isArray(data.headers)) {
    throw new Error("Getty ESP returned invalid upload headers");
  }
  return { url: url.href, headers: data.headers };
}

async function sendPart(input, id, bytes, number, raster) {
  const query = new URLSearchParams({
    id: String(id), part_number: String(number), raster_file: String(raster),
    encrypted_payload: createHash("sha256").update(bytes).digest("hex"),
  });
  const data = await input.sendApi("GET", `${INGESTION}/${encodeURIComponent(String(id))}/authorize_chunk?${query}`);
  const target = checkedUploadTarget(data);
  const etag = await input.sendChunk(target.url, bytes, target.headers);
  if (typeof etag !== "string" || etag.trim() === "") throw new Error("Getty ESP storage response omitted ETag");
  return { part_number: String(number), etag };
}

async function uploadFile(input, id, file, raster) {
  const etags = [];
  for (let offset = 0, number = 1; offset < file.bytes.length; offset += CHUNK_SIZE, number += 1) {
    etags.push(await sendPart(input, id, file.bytes.subarray(offset, offset + CHUNK_SIZE), number, raster));
  }
  await input.sendApi("PUT", `${INGESTION}/${encodeURIComponent(String(id))}`, { id, etags, raster_file: raster });
}

export async function uploadEspContribution(input) {
  validateInput(input);
  const result = await input.sendApi("POST", INGESTION, initiationPayload(input));
  const id = result?.contribution_id;
  if ((typeof id !== "string" && typeof id !== "number") || String(id).trim() === "") {
    throw new Error("Getty ESP did not return a contribution id");
  }
  if (input.vector) await uploadFile(input, id, input.vector, false);
  await uploadFile(input, id, input.raster, true);
  return id;
}
