import { execSync } from "node:child_process";

const port = process.argv[2] ?? "3000";

function freePortWindows(targetPort) {
  try {
    const output = execSync(`netstat -ano | findstr :${targetPort}`, {
      encoding: "utf8",
    });

    const pids = new Set();
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.includes("LISTENING")) {
        continue;
      }

      const parts = trimmed.split(/\s+/);
      const pid = parts.at(-1);
      if (pid && /^\d+$/.test(pid) && pid !== "0") {
        pids.add(pid);
      }
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`Stopped process ${pid} on port ${targetPort}`);
      } catch {
        // Process may have already exited.
      }
    }
  } catch {
    // Nothing listening on this port.
  }
}

function freePortUnix(targetPort) {
  try {
    execSync(`lsof -ti tcp:${targetPort} | xargs kill -9`, {
      stdio: "ignore",
      shell: true,
    });
    console.log(`Stopped process on port ${targetPort}`);
  } catch {
    // Nothing listening on this port.
  }
}

if (process.platform === "win32") {
  freePortWindows(port);
} else {
  freePortUnix(port);
}
