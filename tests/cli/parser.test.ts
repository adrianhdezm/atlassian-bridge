import { describe, it, expect } from 'vitest';
import { parseTokens } from '../../src/cli/parser.js';
import type { ArgumentDef, OptionDef } from '../../src/cli/cli-models.js';
import { AppError } from '../../src/cli/cli-models.js';

const arg = (name: string, required = true, variadic = false): ArgumentDef => ({
  name,
  description: '',
  required,
  variadic
});

const opt = (long: string, short?: string, valueName?: string): OptionDef => ({
  long,
  description: '',
  short,
  valueName
});

describe('parser', () => {
  describe('parseTokens', () => {
    it('maps positionals to argument definitions', () => {
      const { args } = parseTokens(['hello'], [arg('title')], []);

      expect(args).toEqual({ title: 'hello' });
    });

    it('maps multiple positionals', () => {
      const { args } = parseTokens(['a', 'b'], [arg('first'), arg('second')], []);

      expect(args).toEqual({ first: 'a', second: 'b' });
    });

    it('collects variadic arguments', () => {
      const { args } = parseTokens(['a', 'b', 'c'], [arg('files', false, true)], []);

      expect(args).toEqual({ files: ['a', 'b', 'c'] });
    });

    it('returns empty array for missing variadic', () => {
      const { args } = parseTokens([], [arg('files', false, true)], []);

      expect(args).toEqual({ files: [] });
    });

    it('skips missing optional argument', () => {
      const { args } = parseTokens([], [arg('file', false)], []);

      expect(args).toEqual({});
    });

    it('parses long boolean flag', () => {
      const { opts } = parseTokens(['--verbose'], [], [opt('verbose')]);

      expect(opts).toEqual({ verbose: true });
    });

    it('parses short boolean flag', () => {
      const { opts } = parseTokens(['-v'], [], [opt('verbose', 'v')]);

      expect(opts).toEqual({ verbose: true });
    });

    it('parses long value-taking option', () => {
      const { opts } = parseTokens(['--token', 'abc'], [], [opt('token', 't', 'token')]);

      expect(opts).toEqual({ token: 'abc' });
    });

    it('parses short value-taking option', () => {
      const { opts } = parseTokens(['-t', 'abc'], [], [opt('token', 't', 'token')]);

      expect(opts).toEqual({ token: 'abc' });
    });

    it('splits --flag=value', () => {
      const { opts } = parseTokens(['--token=abc'], [], [opt('token', 't', 'token')]);

      expect(opts).toEqual({ token: 'abc' });
    });

    it('throws when --flag=value used on boolean', () => {
      const act = () => parseTokens(['--verbose=true'], [], [opt('verbose')]);

      expect(act).toThrow(AppError);
    });

    it('treats tokens after -- as positionals', () => {
      const { args } = parseTokens(['--', '--not-a-flag'], [arg('title')], []);

      expect(args).toEqual({ title: '--not-a-flag' });
    });

    it('mixes positionals and options', () => {
      const { args, opts } = parseTokens(
        ['hello', '--verbose', '-t', 'abc'],
        [arg('title')],
        [opt('verbose', 'v'), opt('token', 't', 'token')]
      );

      expect(args).toEqual({ title: 'hello' });
      expect(opts).toEqual({ verbose: true, token: 'abc' });
    });

    it('throws on unknown long option', () => {
      const act = () => parseTokens(['--unknown'], [], []);

      expect(act).toThrow(AppError);
    });

    it('throws on unknown short option', () => {
      const act = () => parseTokens(['-x'], [], []);

      expect(act).toThrow(AppError);
    });

    it('throws when value-taking option has no value', () => {
      const act = () => parseTokens(['--token'], [], [opt('token', 't', 'token')]);

      expect(act).toThrow(AppError);
    });

    it('throws on unexpected positional argument', () => {
      const act = () => parseTokens(['a', 'b'], [arg('title')], []);

      expect(act).toThrow(AppError);
    });
  });
});
