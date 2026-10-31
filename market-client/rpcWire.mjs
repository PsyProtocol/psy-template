// Generic transport framing only. This does not verify state, proof or finality.
export class RpcProtocolError extends Error {
  constructor(message, options) { super(message, options); this.name = 'RpcProtocolError'; }
}
const require = (value, message) => { if (!value) throw new RpcProtocolError(message); };
export function discardResponse(response) {
  // Cancellation must not turn a terminal protocol error into an unbounded wait.
  try { Promise.resolve(response.body?.cancel()).catch(() => {}); } catch { /* Preserve the original failure. */ }
}
export async function readBoundedUtf8(response, maxBytes) {
  require(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 64 * 1024 * 1024, 'Invalid public response limit');
  const declared = response.headers?.get('content-length');
  if (declared !== undefined && declared !== null && (!/^(0|[1-9]\d*)$/.test(declared) || BigInt(declared) > BigInt(maxBytes))) {
    discardResponse(response); throw new RpcProtocolError('Public response exceeds limit');
  }
  if (response.body === null) return '';
  const reader = response.body?.getReader();
  require(reader, 'Bounded public response stream required');
  const chunks = []; let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      require(value instanceof Uint8Array, 'Invalid public response chunk');
      count += value.byteLength;
      require(count <= maxBytes, 'Public response exceeds limit');
      chunks.push(value);
    }
    const bytes = new Uint8Array(count); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (cause) { throw new RpcProtocolError('Invalid public response UTF-8', { cause }); }
  } catch (error) {
    try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally { reader.releaseLock(); }
}
export function rpcEnvelope(value, expectedId = 1) {
  require(value !== null && typeof value === 'object' && !Array.isArray(value), 'Invalid RPC envelope');
  require(value.jsonrpc === '2.0' && (value.id === expectedId || (typeof value.id === 'bigint' && value.id === BigInt(expectedId))), 'RPC envelope identity mismatch');
  const result = Object.hasOwn(value, 'result'), error = Object.hasOwn(value, 'error');
  require(result !== error, 'RPC requires one result or error');
  if (error) {
    const e = value.error;
    require(e !== null && typeof e === 'object' && !Array.isArray(e) && typeof e.message === 'string' &&
      ((typeof e.code === 'number' && Number.isSafeInteger(e.code)) || typeof e.code === 'bigint'), 'Invalid RPC error envelope');
  }
  return value;
}
