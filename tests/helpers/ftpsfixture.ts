import net from "node:net";
import tls from "node:tls";
import selfsigned from "selfsigned";
/** Real local explicit-TLS FTP server, fake account, TLS-only data channel. No public connections. */
export async function ftpsFixture(options: { dropAfterStore?: boolean } = {}) {
  const identity = selfsigned.generate([{ name: "commonName", value: "localhost" }], { keySize: 2048, days: 1, extensions: [{ name: "subjectAltName", altNames: [{ type: 7, ip: "127.0.0.1" }, { type: 2, value: "localhost" }] }] });
  const secureContext = tls.createSecureContext({ key: identity.private, cert: identity.cert });
  const files = new Map<string, Buffer>(), commands: string[] = [], sockets = new Set<net.Socket>(), servers = new Set<net.Server>();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on("error", () => undefined); socket.write("220 Local test FTPS\r\n");
    let control: net.Socket = socket, input = "", dataReady: Promise<tls.TLSSocket>;
    function listen(s: net.Socket) { s.on("data", incoming); s.on("error", () => undefined); }
    function incoming(chunk: Buffer) {
      input += chunk.toString();
      while (input.includes("\r\n")) { const end = input.indexOf("\r\n"), line = input.slice(0, end); input = input.slice(end + 2); void command(line); }
    }
    const reply = (text: string) => control.write(`${text}\r\n`);
    async function command(line: string) {
      const [verb, ...parts] = line.split(" "), arg = parts.join(" "); commands.push(verb);
      if (verb === "AUTH") {
        socket.removeListener("data", incoming); socket.write("234 Start TLS\r\n", () => {
          control = new tls.TLSSocket(socket, { isServer: true, secureContext }); sockets.add(control); listen(control);
        }); return;
      }
      if (!(control instanceof tls.TLSSocket)) { reply("530 TLS required"); return; }
      if (verb === "FEAT") { reply("211-Features\r\n MLST type*;size*;modify*;\r\n UTF8\r\n211 End"); return; }
      if (verb === "USER") { reply("331 Password required"); return; }
      if (verb === "PASS") { reply(arg === "fixture-password" ? "230 Logged in" : "530 Invalid login"); return; }
      if (verb === "PWD") { reply('257 "/"'); return; }
      if (verb === "EPSV") {
        const passive = tls.createServer({ key: identity.private, cert: identity.cert }); servers.add(passive);
        dataReady = new Promise(resolve => passive.once("secureConnection", data => { sockets.add(data); data.on("error", () => undefined); resolve(data); }));
        await new Promise<void>(resolve => passive.listen(0, "127.0.0.1", resolve));
        reply(`229 Entering Extended Passive Mode (|||${(passive.address() as net.AddressInfo).port}|)`); return;
      }
      if (["MLSD", "LIST", "STOR"].includes(verb)) {
        reply("150 Opening TLS data connection"); const data = await dataReady;
        if (verb !== "STOR") { data.end([...files].map(([name, b]) => `type=file;size=${b.length};modify=20261027120000; ${name}\r\n`).join(""), () => reply("226 Transfer complete")); return; }
        const chunks: Buffer[] = []; data.on("data", b => chunks.push(b)); data.on("end", () => { files.set(arg, Buffer.concat(chunks)); data.end(); if (options.dropAfterStore) control.destroy(); else reply("226 Transfer complete"); }); return;
      }
      if (verb === "QUIT") { reply("221 Goodbye"); control.end(); return; }
      reply("200 OK");
    }
    listen(socket);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return { host: "127.0.0.1", port: (server.address() as net.AddressInfo).port, cert: identity.cert, files, commands,
    close: async () => { for (const s of sockets) s.destroy(); for (const s of [...servers, server]) await new Promise<void>(resolve => s.close(() => resolve())); } };
}
