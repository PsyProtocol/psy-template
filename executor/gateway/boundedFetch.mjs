// Additional gateway-only bounds. Existing SDK and core Executor transports are
// unchanged unless this explicit public-read fetch implementation is supplied.
export function publicFetchWith(fetcher, limit = 1048576) {
  return async (url, options = {}) => {
    const response = await fetcher(url, { ...options, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw Error("Public read redirect rejected");
    }
    const declared = response.headers.get("content-length");
    if (
      declared &&
      (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(limit))
    ) {
      await response.body?.cancel();
      throw Error("Public read response exceeds limit");
    }
    const reader = response.body?.getReader(),
      chunks = [];
    let bytes = 0;
    if (reader)
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > limit) {
            await reader.cancel();
            throw Error("Public read response exceeds limit");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    const raw = Buffer.concat(chunks);
    if (response.ok && options.method === "POST" && options.body) {
      const request = JSON.parse(options.body),
        envelope = JSON.parse(raw.toString("utf8"));
      if (
        request.jsonrpc !== "2.0" ||
        typeof request.method !== "string" ||
        !request.method.startsWith("psy_get_") ||
        envelope.jsonrpc !== "2.0" ||
        envelope.id !== request.id
      )
        throw Error("Public RPC envelope mismatch");
    }
    return new Response(raw, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
export const boundedPublicFetch = publicFetchWith((...args) => fetch(...args));
