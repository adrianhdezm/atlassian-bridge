import { z } from 'zod';
import type { ArgumentDef, OptionDef } from './cli-models.js';
import { AppError } from './cli-models.js';

export function parseArgumentSyntax(syntax: string): Pick<ArgumentDef, 'name' | 'required' | 'variadic'> {
  let match = /^<(\w+)>$/.exec(syntax);
  if (match) {
    return { name: match[1]!, required: true, variadic: false };
  }

  match = /^\[(\w+)]$/.exec(syntax);
  if (match) {
    return { name: match[1]!, required: false, variadic: false };
  }

  match = /^\[(\w+)\.\.\.]$/.exec(syntax);
  if (match) {
    return { name: match[1]!, required: false, variadic: true };
  }

  throw new AppError(`Invalid argument syntax: ${syntax}`);
}

export function parseOptionSyntax(syntax: string): Pick<OptionDef, 'short' | 'long' | 'valueName'> {
  const match = /^(?:-(\w),\s+)?--([\w][\w-]*)(?:\s+<([\w][\w-]*)>)?$/.exec(syntax);
  if (!match) {
    throw new AppError(`Invalid option syntax: ${syntax}`);
  }
  const [, short, long, valueName] = match;
  return { short, long: long!, valueName };
}

export function buildArgsSchema(argDefs: readonly ArgumentDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const arg of argDefs) {
    if (arg.variadic) {
      shape[arg.name] = z.array(z.string()).default([]);
    } else if (arg.required) {
      shape[arg.name] = z.string();
    } else {
      shape[arg.name] = z.string().optional();
    }
  }
  return z.object(shape);
}

export function buildOptsSchema(optDefs: readonly OptionDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const opt of optDefs) {
    if (opt.valueName) {
      shape[opt.long] = opt.defaultValue !== undefined ? z.string().default(opt.defaultValue) : z.string().optional();
    } else {
      shape[opt.long] = z.boolean().default(false);
    }
  }
  return z.object(shape);
}

export function validate(schema: z.ZodType, data: unknown): Record<string, unknown> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join(', ');
    throw new AppError(message || 'Validation failed');
  }
  return result.data as Record<string, unknown>;
}
