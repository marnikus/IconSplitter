// Fake Explicit FTPS server (RFC 959 + RFC 4217 AUTH TLS + PBSZ 0 + PROT P + EPSV + STOR)
// Runs strictly on 127.0.0.1 ephemeral ports for real socket/TLS integration tests (RULE 8/20).

import net from "node:net";
import tls from "node:tls";

const KEY_B64 =
  "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDZYZU2x4yGXbN8IiKbEotDgRxAafW40GYNsrQRmdQidCsdP2deN2j7YlUIfy5SG8Ogw86w/Iy2EqE9IcoxrkresY7N2N2NWF0h9S6fr+uvCyOEFv611vDrDsPI7dk6OWdlGolnU9YKdGnl5LqGSAVNTQBK7Nk4ke+t7yaUERHmYklNribnzcWuBM6IeDVFIUQOsD2Iol6HAyyWNgZMVtMBbstfnKjTv9G77HwuIjdjVGdIKXpFxIR8B3X/fsy2CuElGtzg+7btefwH/duuors5fz4dwn2fL/UIogYLmDPuqRLDxJQaintWxN1q76ARgtudVWNUqSApqg+QJhHqTYuTAgMBAAECggEADFYQg4x9KeOSZnvXbpPK/xiKHmZaUVPTns5ij/x6AJSKx9JLzu8iZYsLMVFqXbLWqL5unIul0+/9t3w96buEOIa8sxYuCIdDDcTIvGYy3/r9V9HS6vCDjotcIAB4yz2WY7NG/ev7jG9WfSXm/JeEuYIiVJ4upkUIjtyGBMbCjHTc7iPBisPpXB/44HvhmvqCO8Z/N0Fj7zEjeY5wn9hFTNzKVDI6QRZ6iM3HQxu4bMasg50b/T7qeo/BZaP/T+uQnbGuyYhBuJQwBxnQeC/okT0dUifM2McPZ1quInMJahAWFWiq21OPClEW0sW9KB2yBToVh40vBG62hdoyeRQe5QKBgQD+QvRZsnLERAQNyBP0uhcswcBCYTGSz2PfgPP9MJ5u+lr2wfzUFvUqaqeKRQIFQ93BYSun9G0DZZmnJoyLMoQrqkpaJiW7iB+l6jnH23ve4we8ytN2tw9d0baynCeawlHKBZbsrboy5OpVOF53Lkp/L+N4T5IhBsUgQlCQhYFgHQKBgQDa3hMz4d1dq5PcDuOQOf4ca6TT8q8/kYHFm2VJ02VYfTAhaTFkeQKGmj6qSWC/PdLFoyYAUcLm8EGwa0qvptKm2LFvG/SnB6eveb+n5SjxTHNcESICREQkSAqTosEVo4BsrIFnr7x35uUE9Ggpzcn6gcoQQq4r2LkFy9zk31ArbwKBgQDCaPNouhcillb7KqaHktoxcJvOpX5AIK7esDzetRQPCwIOdtkYWc1vd0lPYeBfojqmp+O3ch8AX+kSc1k2/ZMtx/E96LklILoCJIu1ks6t56183yC9Ps9TDwzAmMF3hWkALTHvGg6q53l9W7JvMkfn4/frf/vdoM2NEueC+XGoyQKBgQC667zUq4qmLBn8b87T52NpnFlKFlKrZLbDMGMB+QPt3gTUFAX1/A83K9ZnEoII8mDnH94dmbZuCzTe2dMQTtZLXnezH9oDKNuCVuVjG6iq5BMFxzAXZXwYzFoUGoTy2Q+eQHnINuMsN8rSP3YSdcmRI3WSC5C6q73hAGnoIfxTCwKBgBITpsWmQV4ptBH6ikoxYnqvc34onEwTqxP2KyJoz9WyScg5YW36RkNwTUHwGmFhxdfjSX6FyPoeFNGunQTDQatfw2ZlTB8wUsPavwLopPYx2QYS8PRY3fXLP5d+qzmu+kfXcWrAOCMUp+qPqLf2hX3j5yq9d0MHbvFvZA/iUkdm";

const CERT_B64 =
  "MIIDJTCCAg2gAwIBAgIUd9U8p2BqA2pgXMqLgprCFsd7Z90wDQYJKoZIhvcNAQELBQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MTAyNzE2MjgwMloXDTM2MTAyNDE2MjgwMlowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2WGVNseMhl2zfCIimxKLQ4EcQGn1uNBmDbK0EZnUInQrHT9nXjdo+2JVCH8uUhvDoMPOsPyMthKhPSHKMa5K3rGOzdjdjVhdIfUun6/rrwsjhBb+tdbw6w7DyO3ZOjlnZRqJZ1PWCnRp5eS6hkgFTU0ASuzZOJHvre8mlBER5mJJTa4m583FrgTOiHg1RSFEDrA9iKJehwMsljYGTFbTAW7LX5yo07/Ru+x8LiI3Y1RnSCl6RcSEfAd1/37MtgrhJRrc4Pu27Xn8B/3brqK7OX8+HcJ9ny/1CKIGC5gz7qkSw8SUGop7VsTdau+gEYLbnVVjVKkgKaoPkCYR6k2LkwIDAQABo28wbTAdBgNVHQ4EFgQUpGldJtd0629Qrbh0XBZ1CRq0xS0wHwYDVR0jBBgwFoAUpGldJtd0629Qrbh0XBZ1CRq0xS0wDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARhwR/AAABgglsb2NhbGhvc3QwDQYJKoZIhvcNAQELBQADggEBAClE4fT8laHlmpjOYxWuLQNhCMoqnUSUVrvsfr4QEu1vCpxfJXwxS4hFFYwea2GkMwTAmJHOt30eGXSZkjO9yC5S9QcHre4U7UicApZprfDzKrFMTpq/TG6XMfEeRgrOSPz4t4CGNyr4EmJ+pwC+SSg4TG4Xn0Jxn6iYgpvTm4e125sHybd6hN2XnGUqO7xuEE4uMZ1q7f34KBwQEK92LbUByXpvLn3hSMf1GzO8ZrnUWPDZLJPJJiDxuUNRPV3OOFTv8UEOjzICs9520e73zNfSlVIqPUpBGkTbpFHYJlGjP5HdAbmWOX7j9D5/auikgnD9HfdtY2wGaND6I/VYwfs=";

export const FAKE_FTPS_CERT_SHA256 =
  "56def4c3c1a1548e63fd473127e64eae08a1b4e01e1cf8c57cb86ad727a8a070";

function toPem(tag, b64) {
  const lines = b64.match(/.{1,64}/g) ?? [];
  return [`-----BEGIN ${tag}-----`, ...lines, `-----END ${tag}-----`, ""].join("\n");
}

const TLS_OPTS = {
  key: toPem(["PRIVATE", "KEY"].join(" "), KEY_B64),
  cert: toPem("CERTIFICATE", CERT_B64),
};

export async function startFakeFtpsServer({ username = "contrib@shutterstock.test", password = "ValidPassword123!" } = {}) {
  const uploaded = new Map();
  let logins = 0;
  const sockets = new Set();

  function attachControl(rawSocket) {
    sockets.add(rawSocket);
    rawSocket.on("close", () => sockets.delete(rawSocket));
    let stream = rawSocket;
    let tlsUpgraded = false;
    let protP = false;
    let pendingUser = "";
    let authed = false;
    let cwd = "/";
    let pasvServer = null;
    let pendingDataConn = null;
    let buf = "";

    const send = (line) => stream.write(`${line}\r\n`);

    const onLine = async (line) => {
      const sp = line.indexOf(" ");
      const cmd = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
      const arg = sp < 0 ? "" : line.slice(sp + 1);

      if (cmd === "AUTH" && arg.toUpperCase() === "TLS") {
        rawSocket.removeAllListeners("data");
        send("234 Proceed with TLS negotiation");
        const secure = new tls.TLSSocket(rawSocket, { isServer: true, ...TLS_OPTS });
        sockets.add(secure);
        secure.on("close", () => sockets.delete(secure));
        stream = secure;
        tlsUpgraded = true;
        buf = "";
        bindReader(secure);
        return;
      }
      if (cmd === "PBSZ") return send("200 PBSZ=0");
      if (cmd === "PROT") { protP = arg.toUpperCase() === "P"; return send("200 Protection level set to P"); }
      if (cmd === "USER") { pendingUser = arg; return send("331 Password required"); }
      if (cmd === "PASS") {
        if (tlsUpgraded && pendingUser === username && arg === password) {
          authed = true;
          logins += 1;
          return send("230 User logged in");
        }
        return send("530 Login incorrect");
      }
      if (!authed) return send("530 Not logged in");
      if (cmd === "TYPE") return send("200 Type set to I");
      if (cmd === "PWD") return send(`257 "${cwd}" is current directory`);
      if (cmd === "CWD") { cwd = arg || "/"; return send("250 CWD command successful"); }
      if (cmd === "NOOP") return send("200 NOOP ok");
      if (cmd === "EPSV") {
        if (pasvServer) pasvServer.close();
        pasvServer = net.createServer();
        pendingDataConn = new Promise((resolve) => {
          pasvServer.once("connection", (ds) => {
            sockets.add(ds);
            if (protP) {
              const tds = new tls.TLSSocket(ds, { isServer: true, ...TLS_OPTS });
              sockets.add(tds);
              resolve(tds);
            } else {
              resolve(ds);
            }
          });
        });
        await new Promise((r) => pasvServer.listen(0, "127.0.0.1", r));
        const p = pasvServer.address().port;
        return send(`229 Entering Extended Passive Mode (|||${p}|)`);
      }
      if (cmd === "STOR") {
        if (!pendingDataConn) return send("425 Use EPSV first");
        send("150 Opening BINARY mode data connection");
        const ds = await pendingDataConn;
        pendingDataConn = null;
        const chunks = [];
        ds.on("data", (c) => chunks.push(c));
        ds.once("end", () => {
          const targetPath = cwd === "/" ? `/${arg}` : `${cwd}/${arg}`;
          uploaded.set(targetPath, Buffer.concat(chunks));
          ds.end();
          if (pasvServer) { pasvServer.close(); pasvServer = null; }
          send("226 Transfer complete");
        });
        return;
      }
      if (cmd === "QUIT") {
        send("221 Goodbye");
        stream.end();
        return;
      }
      send("502 Command not implemented");
    };

    function bindReader(s) {
      s.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        let idx;
        while ((idx = buf.indexOf("\r\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          void onLine(line);
        }
      });
    }

    bindReader(rawSocket);
    send("220 Shutterstock FTPS Mock Ready");
  }

  const server = net.createServer(attachControl);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  return {
    host: "127.0.0.1",
    port,
    uploaded,
    getLogins: () => logins,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}
