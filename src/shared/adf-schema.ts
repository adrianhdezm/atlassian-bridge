import adfJsonSchema from './adf-schema.json' with { type: 'json' };
import type { JSONSchema } from 'zod/v4/core';
import { z } from 'zod';

export const AdfSchema = z.fromJSONSchema(adfJsonSchema as JSONSchema.JSONSchema);
