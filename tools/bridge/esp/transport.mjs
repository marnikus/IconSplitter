// ESP API and signed S3 transport. Never send Getty credentials to storage.
import { URL } from "node:url";
import { FtpsError } from "../ftps/reply.mjs";
import { espHttpsRequest } from "./http.mjs";

function storageTarget(raw, conn) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const localTest = conn.host === "127.0.0.1" && host === conn.host && Number(url.port) === conn.port;
  const amazon = host.endsWith(".amazonaws.com") || host.endsWith(".amazonaws.com.cn");
  if (url.protocol !== "https:" || url.username || url.password || (!amazon && !localTest)) {
    throw new FtpsError("ftp", "Getty ESP returned an untrusted storage upload host");
  }
  return { host, port: Number(url.port || 443), path: `${url.pathname}${url.search}`, localTest };
}

export function createIngestionTransports({ conn, auth, onAbortHook, throwEspApiFailure }) {
  return {
    async sendApi(method, path, payload) {
      const body = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
      const headers = { accept: "application/json", "api-key": auth.headerApiKey,
        authorization: `Token token=${auth.accessToken}`, "content-type": "application/json" };
      if (body) headers["content-length"] = body.length;
      const res = await espHttpsRequest({ ...conn, method, path, headers, body, onAbortHook });
      if (res.status < 200 || res.status >= 300) {
        await throwEspApiFailure(conn, auth, res.status, res.body, "Getty ESP ingestion failed");
      }
      if (!res.body.length) return {};
      try { return JSON.parse(res.body.toString("utf8")); } catch { throw new FtpsError("ftp", "Getty ESP returned invalid JSON"); }
    },
    async sendChunk(raw, bytes, signedHeaders) {
      const target = storageTarget(raw, conn);
      const res = await espHttpsRequest({ ...conn, host: target.host, port: target.port, path: target.path,
        tlsPolicy: target.localTest ? conn.tlsPolicy : "strict", pinnedCertSha256: target.localTest ? conn.pinnedCertSha256 : "",
        method: "PUT", headers: signedHeaders, body: bytes, onAbortHook });
      if (res.status < 200 || res.status >= 300) throw new FtpsError("ftp", `Getty ESP storage upload failed (HTTP ${res.status})`);
      return res.headers.etag;
    },
  };
}
