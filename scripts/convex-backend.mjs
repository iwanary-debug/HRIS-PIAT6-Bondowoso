/**
 * Companion-process wrapper used by the Freebuff preview (and `bun run dev`).
 *
 * `bun run dev` = `node scripts/convex-backend.mjs -- vite --host 0.0.0.0`
 *
 * The Convex local backend must run alongside the Vite dev server so the
 * preview (and the remote browser) can reach it. Both processes are killed
 * together when the wrapper receives SIGINT/SIGTERM or either child exits,
 * so the preview manager stays in full control of the lifecycle.
 *
 * The backend serves HTTP on 3210 and site data on 3211. On dev previews the
 * browser reaches it through the public workspace subdomain
 * (`https://3210-<workspace>.e2b.app`), configured via VITE_CONVEX_URL.
 */

import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const argv = process.argv.slice(2);
if (argv[0] !== "--" || argv.length < 2) {
  console.error("Usage: node scripts/convex-backend.mjs -- <main command...>");
  process.exit(2);
}
const mainCommand = argv.slice(1);

const BACKEND_READY_MARKER = "[Local] Port 3210";

const children = new Map();

function start(name, command, args, { ready } = {}) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    // Own process group so signal fan-out reaches the whole tree — bunx and
    // the convex CLI spawn nested children that ignore plain child.kill().
    detached: true,
  });
  children.set(name, child);

  const forward = (source) => {
    let buffered = "";
    source.setEncoding("utf8");
    source.on("data", (chunk) => {
      process.stdout.write(chunk);
      if (ready) {
        buffered += chunk;
        if (buffered.includes(ready)) {
          console.log(`[companion] ${name} is ready`);
          ready = undefined;
        }
        if (buffered.length > 8192) buffered = "";
      }
    });
  };
  forward(child.stdout);
  forward(child.stderr);

  child.on("exit", (code) => {
    children.delete(name);
  });

  return child;
}

start("convex", "bunx", ["convex", "dev", "--typecheck", "disable"], {
  ready: BACKEND_READY_MARKER,
});
start("main", mainCommand[0], mainCommand.slice(1));

function signalTree(child, signal) {
  try {
    if (child.pid && child.exitCode === null) process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

/** Kill the local-backend server binary wherever it hides in the process
 * tree — the Convex CLI spawns it outside the wrapper's process group. Only
 * backends that descend from this wrapper (PPID walk) are touched. */
function killBackendByProcScan() {
  try {
    const backendPids = new Set();
    for (const entry of readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cmdline = readFileSync(`/proc/${entry}/cmdline`, "utf8");
        if (cmdline.includes("convex-local-backend")) backendPids.add(Number(entry));
      } catch {
        // process vanished — fine
      }
    }
    for (const pid of backendPids) {
      let current = pid;
      let owned = false;
      for (let depth = 0; depth < 12 && current > 1; depth += 1) {
        try {
          const stat = readFileSync(`/proc/${current}/stat`, "utf8");
          const ppid = Number(
            stat.slice(stat.lastIndexOf(")") + 2).trim().split(" ")[1],
          );
          if (ppid === process.pid) {
            owned = true;
            break;
          }
          current = ppid;
        } catch {
          break;
        }
      }
      if (owned) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }
  } catch {
    // /proc unavailable — nothing more we can do
  }
}

function shutdown(immediate = false) {
  for (const child of children.values()) {
    signalTree(child, "SIGTERM");
  }
  const finish = () => {
    for (const child of children.values()) {
      signalTree(child, "SIGKILL");
    }
    killBackendByProcScan();
  };
  if (immediate) {
    finish();
    return;
  }
  setTimeout(finish, 1500).unref();
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => shutdown());
}

// If either child exits, tear the other one down so the pair never leaves a
// half-running preview behind (e.g. vite crashes while convex keeps the port).
for (const name of ["convex", "main"]) {
  const child = children.get(name);
  child?.on("exit", () => {
    setTimeout(() => {
      const stillRunning = [...children.values()].some((c) => c.exitCode === null);
      if (stillRunning) shutdown();
      process.exit(process.exitCode || 1);
    }, 250);
  });
}
process.on("exit", () => shutdown(true));
