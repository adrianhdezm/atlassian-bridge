import { describe, it, expect } from 'vitest';
import { parseArgumentSyntax, parseOptionSyntax, buildArgsSchema, buildOptsSchema, validate } from '../../src/cli/syntax.js';
import { AppError } from '../../src/cli/cli-models.js';

describe('syntax', () => {
  describe('parseArgumentSyntax', () => {
    it('parses required argument <name>', () => {
      const result = parseArgumentSyntax('<title>');

      expect(result).toEqual({ name: 'title', required: true, variadic: false });
    });

    it('parses optional argument [name]', () => {
      const result = parseArgumentSyntax('[file]');

      expect(result).toEqual({ name: 'file', required: false, variadic: false });
    });

    it('parses variadic argument [name...]', () => {
      const result = parseArgumentSyntax('[files...]');

      expect(result).toEqual({ name: 'files', required: false, variadic: true });
    });

    it('throws on bare word', () => {
      const act = () => parseArgumentSyntax('name');

      expect(act).toThrow(AppError);
    });

    it('throws on empty angle brackets', () => {
      const act = () => parseArgumentSyntax('<>');

      expect(act).toThrow(AppError);
    });

    it('throws on empty string', () => {
      const act = () => parseArgumentSyntax('');

      expect(act).toThrow(AppError);
    });
  });

  describe('parseOptionSyntax', () => {
    it('parses short + long boolean flag', () => {
      const result = parseOptionSyntax('-v, --verbose');

      expect(result).toEqual({ short: 'v', long: 'verbose', valueName: undefined });
    });

    it('parses long-only boolean flag', () => {
      const result = parseOptionSyntax('--verbose');

      expect(result).toEqual({ short: undefined, long: 'verbose', valueName: undefined });
    });

    it('parses short + long with value', () => {
      const result = parseOptionSyntax('-p, --priority <level>');

      expect(result).toEqual({ short: 'p', long: 'priority', valueName: 'level' });
    });

    it('parses long-only with value', () => {
      const result = parseOptionSyntax('--token <token>');

      expect(result).toEqual({ short: undefined, long: 'token', valueName: 'token' });
    });

    it('parses hyphenated long flag', () => {
      const result = parseOptionSyntax('--dry-run');

      expect(result).toEqual({ short: undefined, long: 'dry-run', valueName: undefined });
    });

    it('throws on bare word', () => {
      const act = () => parseOptionSyntax('verbose');

      expect(act).toThrow(AppError);
    });

    it('throws on lone dash', () => {
      const act = () => parseOptionSyntax('-');

      expect(act).toThrow(AppError);
    });
  });

  describe('buildArgsSchema', () => {
    it('validates required argument', () => {
      const schema = buildArgsSchema([{ name: 'title', description: '', required: true, variadic: false }]);

      const result = schema.parse({ title: 'hello' });

      expect(result).toEqual({ title: 'hello' });
    });

    it('rejects missing required argument', () => {
      const schema = buildArgsSchema([{ name: 'title', description: '', required: true, variadic: false }]);

      expect(() => schema.parse({})).toThrow();
    });

    it('allows missing optional argument', () => {
      const schema = buildArgsSchema([{ name: 'file', description: '', required: false, variadic: false }]);

      const result = schema.parse({});

      expect(result).toEqual({});
    });

    it('defaults variadic to empty array', () => {
      const schema = buildArgsSchema([{ name: 'files', description: '', required: false, variadic: true }]);

      const result = schema.parse({});

      expect(result).toEqual({ files: [] });
    });

    it('passes variadic array through', () => {
      const schema = buildArgsSchema([{ name: 'files', description: '', required: false, variadic: true }]);

      const result = schema.parse({ files: ['a', 'b'] });

      expect(result).toEqual({ files: ['a', 'b'] });
    });
  });

  describe('buildOptsSchema', () => {
    it('defaults boolean flag to false', () => {
      const schema = buildOptsSchema([{ long: 'verbose', description: '' }]);

      const result = schema.parse({});

      expect(result).toEqual({ verbose: false });
    });

    it('passes boolean true through', () => {
      const schema = buildOptsSchema([{ long: 'verbose', description: '' }]);

      const result = schema.parse({ verbose: true });

      expect(result).toEqual({ verbose: true });
    });

    it('applies string default', () => {
      const schema = buildOptsSchema([{ long: 'priority', description: '', valueName: 'level', defaultValue: 'medium' }]);

      const result = schema.parse({});

      expect(result).toEqual({ priority: 'medium' });
    });

    it('allows missing optional value-taking option', () => {
      const schema = buildOptsSchema([{ long: 'token', description: '', valueName: 'token' }]);

      const result = schema.parse({});

      expect(result).toEqual({});
    });

    it('passes provided value through', () => {
      const schema = buildOptsSchema([{ long: 'token', description: '', valueName: 'token' }]);

      const result = schema.parse({ token: 'abc' });

      expect(result).toEqual({ token: 'abc' });
    });
  });

  describe('validate', () => {
    it('returns validated data', () => {
      const schema = buildOptsSchema([{ long: 'verbose', description: '' }]);

      const result = validate(schema, {});

      expect(result).toEqual({ verbose: false });
    });

    it('throws AppError on invalid data', () => {
      const schema = buildArgsSchema([{ name: 'title', description: '', required: true, variadic: false }]);

      expect(() => validate(schema, {})).toThrow(AppError);
    });
  });
});
