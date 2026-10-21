/* global document */
import { readStockFile } from "./reader.mjs";
function node(doc, tag, content, field) {
  const el = doc.createElement(tag);
  if (content) el.textContent = content;
  if (field) el.dataset.field = field;
  return el;
}
function metadataFields(doc, meta) {
  const list = node(doc, "dl");
  for (const [name, value] of [["Title", meta.title], ["Description", meta.description]]) {
    list.append(node(doc, "dt", name), node(doc, "dd", value, name.toLowerCase()));
  }
  list.append(node(doc, "dt", "Tags"));
  const tags = node(doc, "ul", "", "tags");
  for (const tag of meta.tags) tags.append(node(doc, "li", tag));
  const dd = node(doc, "dd"); dd.append(tags); list.append(dd);
  return list;
}
async function readFile(doc, file, card) {
  try {
    if (file.size > 50 * 1024 * 1024) throw new Error("File exceeds the 50 MB test-page limit");
    const read = readStockFile(new Uint8Array(await file.arrayBuffer()));
    card.append(node(doc, "p", `${read.kind} · ${read.carriers.join(" + ")} · read from file bytes`), metadataFields(doc, read.metadata));
    if (read.iptc) {
      const details = node(doc, "details");
      details.append(node(doc, "summary", "IPTC compatibility copy (legacy byte limits)"), metadataFields(doc, read.iptc));
      card.append(details);
    } else card.append(node(doc, "p", "No IPTC compatibility copy. Re-export with the latest app for legacy stock readers."));
    card.dataset.state = "ready";
  } catch (error) {
    card.append(node(doc, "p", error instanceof Error ? error.message : "Unable to read file"));
    card.dataset.state = "error";
  }
}
export function mountReader(doc = document) {
  const input = doc.querySelector("#files");
  const results = doc.querySelector("#results");
  const changed = () => {
    results.replaceChildren();
    for (const file of input.files ?? []) {
      const card = node(doc, "article");
      card.dataset.state = "reading";
      card.append(node(doc, "h2", file.name));
      results.append(card);
      void readFile(doc, file, card);
    }
  };
  input.addEventListener("change", changed);
  return () => input.removeEventListener("change", changed);
}
