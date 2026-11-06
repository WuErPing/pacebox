/**
 * 本机 macOS 通知服务：Web 端 POST /notify，服务端用 osascript 直接弹系统通知。
 * 仅监听 127.0.0.1，且拒绝非本机页面来源，避免任意网页调用。
 *
 * 用法：npm run notify:server
 */
import { execFile } from "node:child_process";
import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 39527;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 1000;

// 通过 argv 传参，避免把用户文本拼进 AppleScript 造成注入
const NOTIFY_SCRIPT = `
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
`;

function isLocalOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function sendJson(res, status, payload, origin) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...(origin ? corsHeaders(origin) : {}),
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function showNotification(title, body) {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-e", NOTIFY_SCRIPT, "--", title, body],
      { timeout: 5000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve();
      },
    );
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;

  if (origin && !isLocalOrigin(origin)) {
    sendJson(res, 403, { ok: false, error: "origin not allowed" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, origin ? corsHeaders(origin) : {});
    res.end();
    return;
  }

  const { pathname } = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true, platform: process.platform }, origin);
    return;
  }

  if (req.method === "POST" && pathname === "/notify") {
    if (process.platform !== "darwin") {
      sendJson(
        res,
        501,
        { ok: false, error: "osascript notifications are macOS-only" },
        origin,
      );
      return;
    }
    try {
      const payload = await readJson(req);
      const title =
        typeof payload.title === "string"
          ? payload.title.slice(0, MAX_TITLE_LENGTH)
          : "";
      const body =
        typeof payload.body === "string"
          ? payload.body.slice(0, MAX_BODY_LENGTH)
          : "";
      if (!title) {
        sendJson(res, 400, { ok: false, error: "title is required" }, origin);
        return;
      }
      await showNotification(title, body);
      sendJson(res, 200, { ok: true }, origin);
    } catch (error) {
      sendJson(
        res,
        500,
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        origin,
      );
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "not found" }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`Pacebox 本机通知服务：http://${HOST}:${PORT}`);
  console.log("Web 端将优先通过该服务弹出 macOS 系统通知（osascript）。");
});
