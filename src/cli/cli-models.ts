import { z } from 'zod';

export { AppError } from '../shared/app-error.js';

export const ArgumentDefSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean(),
  variadic: z.boolean()
});

export type ArgumentDef = z.infer<typeof ArgumentDefSchema>;

export const OptionDefSchema = z.object({
  long: z.string(),
  description: z.string(),
  short: z.string().optional(),
  valueName: z.string().optional(),
  defaultValue: z.string().optional()
});

export type OptionDef = z.infer<typeof OptionDefSchema>;

export type OutputWriter = (message: string) => void;

export type Action = (args: Record<string, unknown>, opts: Record<string, unknown>) => void | Promise<void>;
