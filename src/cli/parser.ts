import type { ArgumentDef, OptionDef } from './cli-models.js';
import { AppError } from './cli-models.js';

export function parseTokens(
  tokens: string[],
  argDefs: readonly ArgumentDef[],
  optDefs: readonly OptionDef[]
): { args: Record<string, unknown>; opts: Record<string, unknown> } {
  const positionals: string[] = [];
  const opts: Record<string, unknown> = {};
  let i = 0;
  let rest = false;

  while (i < tokens.length) {
    const token = tokens[i]!;

    if (rest) {
      positionals.push(token);
      i++;
      continue;
    }

    if (token === '--') {
      rest = true;
      i++;
      continue;
    }

    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      if (eqIdx !== -1) {
        const name = token.slice(2, eqIdx);
        const value = token.slice(eqIdx + 1);
        const opt = findByLong(optDefs, name);
        if (!opt.valueName) {
          throw new AppError(`Option --${name} does not take a value`);
        }
        opts[opt.long] = value;
      } else {
        const name = token.slice(2);
        const opt = findByLong(optDefs, name);
        if (opt.valueName) {
          const next = tokens[++i];
          if (next === undefined) {
            throw new AppError(`Option --${name} requires a value`);
          }
          opts[opt.long] = next;
        } else {
          opts[opt.long] = true;
        }
      }
      i++;
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const shortName = token.slice(1);
      const opt = findByShort(optDefs, shortName);
      if (opt.valueName) {
        const next = tokens[++i];
        if (next === undefined) {
          throw new AppError(`Option -${shortName} requires a value`);
        }
        opts[opt.long] = next;
      } else {
        opts[opt.long] = true;
      }
      i++;
      continue;
    }

    positionals.push(token);
    i++;
  }

  const args: Record<string, unknown> = {};
  let posIdx = 0;
  for (const argDef of argDefs) {
    if (argDef.variadic) {
      args[argDef.name] = positionals.slice(posIdx);
      posIdx = positionals.length;
    } else if (posIdx < positionals.length) {
      args[argDef.name] = positionals[posIdx];
      posIdx++;
    }
  }

  if (posIdx < positionals.length) {
    throw new AppError(`Unexpected argument: ${positionals[posIdx]}`);
  }

  return { args, opts };
}

function findByLong(optDefs: readonly OptionDef[], name: string): OptionDef {
  const opt = optDefs.find((o) => o.long === name);
  if (!opt) {
    throw new AppError(`Unknown option: --${name}`);
  }
  return opt;
}

function findByShort(optDefs: readonly OptionDef[], name: string): OptionDef {
  const opt = optDefs.find((o) => o.short === name);
  if (!opt) {
    throw new AppError(`Unknown option: -${name}`);
  }
  return opt;
}
