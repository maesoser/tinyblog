/**
 * R2 read/write/delete helper wrappers.
 */

/** Read an R2 object as text, or return null if it doesn't exist. */
export async function r2GetText(bucket: R2Bucket, key: string): Promise<string | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return obj.text();
}

/** Write a text value to R2. */
export async function r2PutText(
  bucket: R2Bucket,
  key: string,
  value: string,
  contentType = 'text/plain; charset=utf-8',
): Promise<void> {
  await bucket.put(key, value, {
    httpMetadata: { contentType },
  });
}

/** Write binary data to R2. */
export async function r2PutBinary(
  bucket: R2Bucket,
  key: string,
  value: ArrayBuffer | ReadableStream,
  contentType: string,
): Promise<void> {
  await bucket.put(key, value, {
    httpMetadata: { contentType },
  });
}

/** Delete one or more R2 objects. */
export async function r2Delete(bucket: R2Bucket, ...keys: string[]): Promise<void> {
  if (keys.length === 1) {
    await bucket.delete(keys[0]);
  } else if (keys.length > 1) {
    await bucket.delete(keys);
  }
}

/** List all R2 keys under a prefix. */
export async function r2ListKeys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await bucket.list({ prefix, cursor, limit: 1000 });
    keys.push(...result.objects.map((o) => o.key));
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);
  return keys;
}
