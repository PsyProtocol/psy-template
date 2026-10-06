// Read-only reconciliation for a response lost after an end-cap broadcast.
const HASH = /^[0-9a-f]{64}$/i;

export function submissionLeaf(response) {
  const data = response?.data ?? response;
  if (data?.submitted === true && HASH.test(data.endUserLeafHash ?? '')) {
    return { endUserLeafHash: data.endUserLeafHash.toLowerCase(), responseUncertain: false };
  }
  const error = typeof data?.error === 'string' ? data.error : '';
  const leaf = error.match(/deterministic leaf ([0-9a-f]{64})\b/i)?.[1];
  return leaf ? { endUserLeafHash: leaf.toLowerCase(), responseUncertain: true } : null;
}

export async function reconcileSubmission({ userId, endUserLeafHash, events, readUserLeafHash, readReceipt }) {
  if (!Number.isSafeInteger(userId) || userId < 1 || userId >= 16_777_216 || !HASH.test(endUserLeafHash ?? '')) {
    throw new RangeError('invalid user or end-user leaf hash');
  }
  const expected = endUserLeafHash.toLowerCase();
  const errors = [];
  for (const event of events) {
    if (event.tx_type !== 'user_endcap' || event.owner_user_id !== userId ||
        !Number.isSafeInteger(event.included_checkpoint_id) || event.included_checkpoint_id < 1 ||
        !HASH.test(event.content_hash ?? '')) continue;
    try {
      const hash = await readUserLeafHash(event.included_checkpoint_id, userId);
      if (typeof hash !== 'string' || hash.toLowerCase() !== expected) continue;
      const result = await readReceipt(event.content_hash);
      const receipt = result?.data;
      if (result?.success !== true || receipt?.status !== 'included' ||
          receipt.owner_user_id !== userId || receipt.included_checkpoint_id !== event.included_checkpoint_id ||
          receipt.content_hash?.toLowerCase() !== event.content_hash.toLowerCase()) {
        errors.push('receipt does not confirm the indexed user/checkpoint/hash');
        continue;
      }
      return { status: 'included', userId, endUserLeafHash: expected,
        checkpoint: event.included_checkpoint_id, contentHash: event.content_hash.toLowerCase(), receipt: result };
    } catch {
      errors.push('historical state or receipt unavailable');
    }
  }
  // Indexer lag, a pending broadcast and a failed lookup can all produce this.
  // A caller must keep the attempt unresolved; this result never authorizes retry.
  return { status: 'unresolved', userId, endUserLeafHash: expected, errors };
}
