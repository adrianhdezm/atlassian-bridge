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
    removePath(current, path.split('.'));
  }
  return current;
}

function removePath(target: unknown, segments: string[]): void {
  if (segments.length === 0 || target === null || target === undefined) {
    return;
  }

  if (Array.isArray(target)) {
    for (const item of target) {
      removePath(item, segments);
    }
    return;
  }

  if (typeof target !== 'object') {
    return;
  }

  const [head, ...rest] = segments;
  if (rest.length === 0) {
    delete (target as Record<string, unknown>)[head!];
  } else {
    removePath((target as Record<string, unknown>)[head!], rest);
  }
}
