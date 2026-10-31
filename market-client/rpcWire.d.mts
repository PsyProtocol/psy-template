export class RpcProtocolError extends Error {
  constructor(message: string, options?: { cause?: unknown });
}
export function discardResponse(response: Pick<Response, 'body'>): void;
export function readBoundedUtf8(response: Pick<Response, 'body' | 'headers'>, maxBytes: number): Promise<string>;
export function rpcEnvelope<T>(value: T, expectedId?: number): T;
