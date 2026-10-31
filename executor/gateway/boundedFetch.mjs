// Gateway adapter around the shared bounded wire checks. No SDK transport changes.
import {readBoundedUtf8,rpcEnvelope,discardResponse} from "../../market-client/rpcWire.mjs";
export function publicFetchWith(fetcher, limit = 1048576) {
  return async (url, options = {}) => {
    const response = await fetcher(url, { ...options, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      discardResponse(response);
      throw Error("Public read redirect rejected");
    }
    const raw = await readBoundedUtf8(response, limit);
    if (response.ok && options.method === "POST" && options.body) {
      const request = JSON.parse(options.body);
      if (request.jsonrpc !== "2.0" || !Number.isSafeInteger(request.id) || typeof request.method !== "string" || !request.method.startsWith("psy_get_"))
        throw Error("Public RPC envelope mismatch");
      rpcEnvelope(JSON.parse(raw), request.id);
    }
    return new Response([204,205,304].includes(response.status)?null:raw, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
export const boundedPublicFetch = publicFetchWith((...args) => fetch(...args));
