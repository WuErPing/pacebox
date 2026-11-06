#!/usr/bin/env node
/**
 * 本机开发进程管理：同时启停 notify 与 web。
 *   node scripts/dev.mjs start [notify|web ...]
 *   node scripts/dev.mjs stop  [notify|web ...]
 *   node scripts/dev.mjs status [notify|web ...]
 *
 * 每个服务以独立进程组（detached）启动，stop 时整组结束，避免遗留 Metro 子进程。
 * PID 与日志存放在 .run/。
 */
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUN_DIR = join(ROOT, ".run");

const SERVICES = {
  notify: {
    command: process.execPath,
    args: [join(ROOT, "scripts/notify-server.mjs")],
    url: "http://127.0.0.1:39527",
  },
  web: {
    command: process.execPath,
    args: [join(ROOT, "node_modules/expo/bin/cli"), "start", "--web"],
    url: "http://localhost:8081",
  },
};

const ALL_SERVICES = Object.keys(SERVICES);

function pidPath(name) {
  return join(RUN_DIR, `${name}.pid`);
}

function logPath(name) {
  return join(RUN_DIR, `${name}.log`);
}

function readPid(name) {
  try {
    return Number.parseInt(readFileSync(pidPath(name), "utf8"), 10);
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // 进程已退出
    }
  }
}

function waitExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    spawnSync("sleep", ["0.1"]);
  }
  return !isAlive(pid);
}

function start(names) {
  mkdirSync(RUN_DIR, { recursive: true });

  for (const name of names) {
    const service = SERVICES[name];
    const runningPid = readPid(name);
    if (runningPid && isAlive(runningPid)) {
      console.log(`${name}: 已在运行 (pid ${runningPid}) ${service.url}`);
      continue;
    }

    const log = openSync(logPath(name), "w");
    const child = spawn(service.command, service.args, {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", log, log],
      env: process.env,
    });
    closeSync(log);
    child.on("error", (error) => {
      console.error(`${name}: 启动失败 - ${error.message}`);
    });
    child.unref();

    writeFileSync(pidPath(name), String(child.pid));
    console.log(`${name}: 已启动 (pid ${child.pid}) ${service.url}`);
    console.log(`  日志: ${relative(ROOT, logPath(name))}`);
  }
}

function stop(names) {
  for (const name of names) {
    const pid = readPid(name);
    if (!pid) {
      console.log(`${name}: 未运行`);
      continue;
    }
    if (!isAlive(pid)) {
      rmSync(pidPath(name), { force: true });
      console.log(`${name}: 已清理陈旧 pid`);
      continue;
    }

    signalGroup(pid, "SIGTERM");
    if (!waitExit(pid, 3000)) {
      signalGroup(pid, "SIGKILL");
      waitExit(pid, 1000);
    }
    rmSync(pidPath(name), { force: true });
    console.log(`${name}: 已停止 (pid ${pid})`);
  }
}

function status(names) {
  for (const name of names) {
    const pid = readPid(name);
    if (pid && isAlive(pid)) {
      console.log(`${name}: 运行中 (pid ${pid}) ${SERVICES[name].url}`);
    } else {
      console.log(`${name}: 未运行`);
    }
  }
}

function usage() {
  console.log("用法: node scripts/dev.mjs <start|stop|status> [notify|web ...]");
}

const [command, ...requested] = process.argv.slice(2);
const names = requested.length > 0 ? requested : ALL_SERVICES;
const unknown = names.filter((name) => !SERVICES[name]);

if (unknown.length > 0) {
  console.error(`未知服务: ${unknown.join(", ")}`);
  usage();
  process.exit(1);
}

switch (command) {
  case "start":
    start(names);
    break;
  case "stop":
    stop(names);
    break;
  case "status":
    status(names);
    break;
  default:
    usage();
    process.exit(1);
}
