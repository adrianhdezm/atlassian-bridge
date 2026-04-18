import { describe, it, expect } from 'vitest';
import { ArgumentDefSchema, OptionDefSchema, AppError } from '../../src/cli/cli-models.js';

describe('cli-models', () => {
  describe('ArgumentDefSchema', () => {
    it('parses a valid required argument', () => {
      const result = ArgumentDefSchema.parse({ name: 'title', description: 'Issue title', required: true, variadic: false });

      expect(result).toEqual({ name: 'title', description: 'Issue title', required: true, variadic: false });
    });

    it('parses a valid optional variadic argument', () => {
      const result = ArgumentDefSchema.parse({ name: 'files', description: 'File list', required: false, variadic: true });

      expect(result).toEqual({ name: 'files', description: 'File list', required: false, variadic: true });
    });

    it('rejects missing name', () => {
      const act = () => ArgumentDefSchema.parse({ description: 'desc', required: true, variadic: false });

      expect(act).toThrow();
    });

    it('rejects wrong type for required', () => {
      const act = () => ArgumentDefSchema.parse({ name: 'x', description: 'd', required: 'yes', variadic: false });

      expect(act).toThrow();
    });

    it('rejects non-string description', () => {
      const act = () => ArgumentDefSchema.parse({ name: 'x', description: 123, required: true, variadic: false });

      expect(act).toThrow();
    });
  });

  describe('OptionDefSchema', () => {
    it('parses a value-taking option with short and default', () => {
      const result = OptionDefSchema.parse({
        long: 'priority',
        description: 'Priority level',
        short: 'p',
        valueName: 'level',
        defaultValue: 'medium'
      });

      expect(result).toEqual({
        long: 'priority',
        description: 'Priority level',
        short: 'p',
        valueName: 'level',
        defaultValue: 'medium'
      });
    });

    it('parses a boolean flag with only required fields', () => {
      const result = OptionDefSchema.parse({ long: 'verbose', description: 'Enable verbose output' });

      expect(result.long).toBe('verbose');
      expect(result.short).toBeUndefined();
      expect(result.valueName).toBeUndefined();
    });

    it('rejects missing long name', () => {
      const act = () => OptionDefSchema.parse({ description: 'desc' });

      expect(act).toThrow();
    });

    it('rejects non-string long name', () => {
      const act = () => OptionDefSchema.parse({ long: 42, description: 'desc' });

      expect(act).toThrow();
    });
  });

  describe('AppError', () => {
    it('is an instance of Error', () => {
      const err = new AppError('test');

      expect(err).toBeInstanceOf(Error);
    });

    it('has name AppError', () => {
      const err = new AppError('oops');

      expect(err.name).toBe('AppError');
    });

    it('preserves the message', () => {
      const err = new AppError('something broke');

      expect(err.message).toBe('something broke');
    });
  });
});
