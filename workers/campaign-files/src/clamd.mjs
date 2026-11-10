// Minimal clamd client (INSTREAM over TCP). No dependencies.
// Protocol: "zINSTREAM\0", then chunks of <uint32 big-endian length><bytes>, then a zero length.
// Reply: "stream: OK", "stream: <Signature> FOUND" or "... ERROR".
import net from "node:net";

const CHUNK = 64 * 1024;

/**
 * @param {Buffer} data
 * @param {{ host: string, port: number, timeoutMs?: number }} options
 * @returns {Promise<{ clean: boolean, signature: string | null, raw: string }>}
 */
export function scanBuffer(data, { host, port, timeoutMs = 120_000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const replies = [];
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(value);
    };

    socket.setTimeout(timeoutMs, () => finish(reject, new Error("clamd timed out")));
    socket.on("error", (error) => finish(reject, error));
    socket.on("data", (chunk) => replies.push(chunk));
    socket.on("end", () => {
      const raw = Buffer.concat(replies).toString("utf8").replace(/\0/g, "").trim();
      try {
        finish(resolve, interpretReply(raw));
      } catch (error) {
        finish(reject, error);
      }
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < data.length; offset += CHUNK) {
        const slice = data.subarray(offset, Math.min(offset + CHUNK, data.length));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(slice.length, 0);
        socket.write(size);
        socket.write(slice);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

/** @param {string} raw */
export function interpretReply(raw) {
  if (/:\s*OK$/.test(raw)) return { clean: true, signature: null, raw };
  const found = raw.match(/:\s*(.+)\s+FOUND$/);
  if (found) return { clean: false, signature: found[1].trim(), raw };
  // "INSTREAM size limit exceeded. ERROR" and anything else is a failed scan, never a pass.
  throw new Error(`clamd could not scan the file: ${raw || "no reply"}`);
}

/** Simple liveness check used at start-up. */
export function ping({ host, port, timeoutMs = 5_000 }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let reply = "";
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
    socket.on("data", (chunk) => (reply += chunk.toString("utf8")));
    socket.on("end", () => resolve(reply.replace(/\0/g, "").trim() === "PONG"));
    socket.on("connect", () => socket.write("zPING\0"));
  });
}
