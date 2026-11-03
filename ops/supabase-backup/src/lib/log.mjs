import fs from "node:fs";
import path from "node:path";

export function createLogger(logDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(logDir, `backup-${stamp}.log`);
  const stream = fs.createWriteStream(file, { flags: "a" });

  const write = (level, message, extra) => {
    const line = {
      at: new Date().toISOString(),
      level,
      message,
      ...(extra ? { extra } : {}),
    };
    const text = JSON.stringify(line);
    stream.write(text + "\n");
    const consoleLine = `[${line.at}] ${level.toUpperCase()} ${message}`;
    if (level === "error") console.error(consoleLine, extra ?? "");
    else console.log(consoleLine, extra ?? "");
  };

  return {
    file,
    info: (message, extra) => write("info", message, extra),
    warn: (message, extra) => write("warn", message, extra),
    error: (message, extra) => write("error", message, extra),
    close: () =>
      new Promise((resolve) => {
        stream.end(resolve);
      }),
  };
}
