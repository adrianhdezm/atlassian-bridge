import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../src/shared/app-error.js';

const mockExecFileSync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync
}));

import { keychainSet, keychainGet, keychainDelete, isMacOS, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT } from '../../src/auth/keychain.js';

describe('keychain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constants', () => {
    it('exports expected service and account names', () => {
      expect(KEYCHAIN_SERVICE).toBe('atl-cli');
      expect(KEYCHAIN_ACCOUNT).toBe('api-token');
    });
  });

  describe('isMacOS', () => {
    it('returns true on darwin', () => {
      const original = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      expect(isMacOS()).toBe(true);
      Object.defineProperty(process, 'platform', original!);
    });

    it('returns false on linux', () => {
      const original = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      expect(isMacOS()).toBe(false);
      Object.defineProperty(process, 'platform', original!);
    });
  });

  describe('keychainSet', () => {
    it('calls security add-generic-password with correct args', () => {
      keychainSet('my-service', 'my-account', 'my-password');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'security',
        ['add-generic-password', '-U', '-s', 'my-service', '-a', 'my-account', '-w', 'my-password'],
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('throws AppError with stderr when execFileSync fails', () => {
      const err = Object.assign(new Error('exit 1'), { stderr: 'access denied\n' });
      mockExecFileSync.mockImplementation(() => {
        throw err;
      });

      expect(() => keychainSet('s', 'a', 'p')).toThrow(AppError);
      expect(() => keychainSet('s', 'a', 'p')).toThrow('failed to save API token to Keychain: access denied');
    });

    it('throws AppError without stderr detail when not available', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('fail');
      });

      expect(() => keychainSet('s', 'a', 'p')).toThrow(AppError);
      expect(() => keychainSet('s', 'a', 'p')).toThrow('failed to save API token to Keychain');
    });
  });

  describe('keychainGet', () => {
    it('returns trimmed stdout on success', () => {
      mockExecFileSync.mockReturnValue('my-secret\n');

      expect(keychainGet('s', 'a')).toBe('my-secret');
    });

    it('calls security find-generic-password with correct args', () => {
      mockExecFileSync.mockReturnValue('tok\n');
      keychainGet('my-service', 'my-account');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'security',
        ['find-generic-password', '-s', 'my-service', '-a', 'my-account', '-w'],
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('returns null when item is not found', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('exit 44');
      });

      expect(keychainGet('s', 'a')).toBeNull();
    });
  });

  describe('keychainDelete', () => {
    it('returns true on success', () => {
      mockExecFileSync.mockReturnValue('');

      expect(keychainDelete('s', 'a')).toBe(true);
    });

    it('calls security delete-generic-password with correct args', () => {
      mockExecFileSync.mockReturnValue('');
      keychainDelete('my-service', 'my-account');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'security',
        ['delete-generic-password', '-s', 'my-service', '-a', 'my-account'],
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('returns false when item is not found', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('exit 44');
      });

      expect(keychainDelete('s', 'a')).toBe(false);
    });
  });
});
