// Launch only the existing read-only gateway and UI. No Executor, signing,
// deployment, faucet, proof, broadcast or wallet-history mutation is started.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(app, "..");
export function unsignedPlanDirectory(configBytes, explicit) {
  if (explicit !== undefined && (!isAbsolute(explicit) || !explicit.trim()))
    throw Error("An explicit unsigned-plan directory must be absolute");
  const identity = createHash("sha256").update(configBytes).digest("hex");
  return (
    explicit ??
    resolve(homedir(), ".local/state/psy-markets/unsigned-plans", identity)
  );
}
export async function assertPortAvailable(port) {
  await new Promise((done, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        Error(
          `Port ${port} is occupied. Keep the existing owner; do not start a second workspace.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(done));
  });
}
export async function launchMarkets(explicitDirectory) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    throw Error("Node.js >=22.12 is required");
  const configFile = resolve(root, "executor/gateway/mainnet-beta-v3.json");
  const configBytes = readFileSync(configFile);
  const config = JSON.parse(configBytes);
  if (config.port !== 5274 || config.origin !== "http://127.0.0.1:5273")
    throw Error("Reviewed loopback gateway endpoints changed");
  // Check both before starting either child. A later race also fails closed at bind.
  await Promise.all([assertPortAvailable(5273), assertPortAvailable(5274)]);
  const directory = unsignedPlanDirectory(configBytes, explicitDirectory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  console.log(
    JSON.stringify({
      service: "psy-markets-workspace",
      unsignedPlanDirectory: directory,
      ui: config.origin,
      financialTasksStarted: 0,
      sdkChanged: false,
    }),
  );
  const children = new Set();
  let stopping = false;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) child.kill("SIGTERM");
    const timer = setTimeout(() => {
      for (const child of children) child.kill("SIGKILL");
    }, 5000);
    timer.unref();
  };
  const start = (name, args, cwd) => {
    const child = spawn(process.execPath, args, { cwd, stdio: "inherit" });
    children.add(child);
    child.once("error", (error) => {
      console.error(`${name} failed to start: ${error.message}`);
      stop(1);
    });
    child.once("exit", (code, signal) => {
      children.delete(child);
      if (!stopping) {
        console.error(
          `${name} exited (${signal ?? code}); stopping owned workspace children.`,
        );
        stop(code || 1);
      }
    });
  };
  process.once("SIGINT", () => stop(130));
  process.once("SIGTERM", () => stop(143));
  start(
    "read-only gateway",
    [resolve(root, "executor/gateway/server.mjs"), configFile, directory],
    root,
  );
  start(
    "market UI",
    [
      resolve(app, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5273",
      "--strictPort",
    ],
    app,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length > 3)
      throw Error(
        "Usage: npm run dev:markets -- [/absolute/unsigned-plan-directory]",
      );
    await launchMarkets(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
