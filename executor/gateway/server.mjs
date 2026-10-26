#!/usr/bin/env node
// Loopback, same-origin, public-only gateway. No arbitrary URL/path/command,
// wallet selection, transaction signing, broadcast, or Executor control route.
import { createServer } from "node:http";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGateway, createGatewayAdapter } from "./adapter.mjs";
export function createPublicGateway({
  adapter,
  origin = "http://127.0.0.1:5273",
  maxActive = 2,
  observe = () => {},
}) {
  let active = 0;
  const server = createServer(async (req, res) => {
    const started = performance.now();
    let route;
    const send = (status, body) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
      });
      res.end(JSON.stringify(body));
    };
    const port = server.address()?.port;
    if (
      req.headers.host !== `127.0.0.1:${port}` ||
      !["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      send(403, { error: "Origin or host rejected" });
      return;
    }
    if (active >= maxActive) {
      send(503, {
        error: "Gateway read capacity busy; no transaction was submitted",
      });
      return;
    }
    active++;
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      route = url.pathname;
      if (url.search) throw Error("Query parameters are not supported");
      if (req.method === "GET" && route === "/v1/status") {
        send(200, await adapter.status());
        return;
      }
      const methods = {
        "/v1/snapshot": "snapshot",
        "/v1/plan": "plan",
        "/v1/receipt": "receipt",
        "/v1/positions": "positionSnapshot",
      };
      if (
        req.method !== "POST" ||
        !Object.hasOwn(methods, route) ||
        typeof adapter[methods[route]] !== "function"
      ) {
        send(404, {
          error:
            "Public read route not found; financial actions are unavailable",
        });
        return;
      }
      if (req.headers["content-type"] !== "application/json") {
        send(415, { error: "application/json required" });
        return;
      }
      let bytes = 0,
        chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 16384) {
          send(413, { error: "Request body too large" });
          return;
        }
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      send(200, await adapter[methods[route]](input));
    } catch (error) {
      const unavailable =
        error.name === "ReadUnavailable" ||
        error.name === "TimeoutError" ||
        error.name === "AbortError";
      send(unavailable ? 503 : 400, {
        error: unavailable
          ? "Configured network read unavailable. No financial action was submitted."
          : "Request or reviewed identity/state validation failed. No financial action was submitted.",
        kind: unavailable ? "read-unavailable" : "validation-rejected",
      });
    } finally {
      active--;
      try {
        observe({
          at: new Date().toISOString(),
          route,
          status: res.statusCode,
          milliseconds: performance.now() - started,
          financialOperations: 0,
        });
      } catch {}
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [file, runtime] = process.argv.slice(2);
  if (!file || !runtime)
    throw Error(
      "Usage: node executor/gateway/server.mjs reviewed-gateway.json durable-unsigned-plan-directory",
    );
  const loaded = await loadGateway(file),
    adapter = await createGatewayAdapter(loaded, {
      planDirectory: resolve(runtime),
    }),
    server = createPublicGateway({
      adapter,
      origin: loaded.config.origin,
      observe: (row) => console.log(JSON.stringify(row)),
    });
  server.listen(loaded.config.port, "127.0.0.1", () =>
    console.log(
      JSON.stringify({
        service: "psy-public-market-gateway",
        port: loaded.config.port,
        registryHash: loaded.config.registrySha256,
        financialSubmission: false,
      }),
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close());
}
