export function stripKeys(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripKeys(item, keys));
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!keys.has(k)) {
        result[k] = stripKeys(v, keys);
      }
    }
    return result;
  }
  return value;
}
