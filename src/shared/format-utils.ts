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

export function stripPaths(value: unknown, paths: ReadonlyArray<string>): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const current = structuredClone(value);
  for (const path of paths) {
    const segments = path.split('.');
    const last = segments.pop()!;
    let target: unknown = current;
    for (const segment of segments) {
      if (typeof target !== 'object' || target === null) {
        target = undefined;
        break;
      }
      target = (target as Record<string, unknown>)[segment];
    }
    if (typeof target === 'object' && target !== null) {
      delete (target as Record<string, unknown>)[last];
    }
  }
  return current;
}
