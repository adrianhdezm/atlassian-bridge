import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppError } from '../../src/shared/app-error.js';

const mockKeychain = vi.hoisted(() => ({
  isMacOS: vi.fn(() => false),
  keychainSet: vi.fn(),
  keychainGet: vi.fn(() => null as string | null),
  keychainDelete: vi.fn(() => false),
  KEYCHAIN_SERVICE: 'atl-cli',
  KEYCHAIN_ACCOUNT: 'api-token'
}));

vi.mock('../../src/auth/keychain.js', () => mockKeychain);

import { CredentialStorage } from '../../src/auth/credential-storage.js';

function validCredentials() {
  return {
    baseUrl: 'https://test.atlassian.net',
    email: 'user@example.com',
    apiToken: 'token123'
  };
}

describe('credential-storage', () => {
  let tmpDir: string;
  let storage: CredentialStorage;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-cli-test-'));
    storage = new CredentialStorage(tmpDir);

    for (const key of ['ATLASSIAN_BASE_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    mockKeychain.isMacOS.mockReturnValue(false);
    mockKeychain.keychainSet.mockReset();
    mockKeychain.keychainGet.mockReset().mockReturnValue(null);
    mockKeychain.keychainDelete.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── non-macOS (file-based, original behavior) ──────────────

  describe('load', () => {
    it('loads credentials from file when no env vars are set', () => {
      fs.writeFileSync(path.join(tmpDir, 'credentials.json'), JSON.stringify(validCredentials()));

      const result = storage.load();

      expect(result).toEqual(validCredentials());
    });

    it('loads credentials entirely from env vars', () => {
      process.env['ATLASSIAN_BASE_URL'] = 'https://env.atlassian.net';
      process.env['ATLASSIAN_EMAIL'] = 'env@example.com';
      process.env['ATLASSIAN_API_TOKEN'] = 'env-token';

      const result = storage.load();

      expect(result).toEqual({
        baseUrl: 'https://env.atlassian.net',
        email: 'env@example.com',
        apiToken: 'env-token'
      });
    });

    it('env vars take priority over file on a per-field basis', () => {
      fs.writeFileSync(path.join(tmpDir, 'credentials.json'), JSON.stringify(validCredentials()));
      process.env['ATLASSIAN_EMAIL'] = 'override@example.com';

      const result = storage.load();

      expect(result.baseUrl).toBe('https://test.atlassian.net');
      expect(result.email).toBe('override@example.com');
      expect(result.apiToken).toBe('token123');
    });

    it('treats empty string env var as unset and falls back to file', () => {
      fs.writeFileSync(path.join(tmpDir, 'credentials.json'), JSON.stringify(validCredentials()));
      process.env['ATLASSIAN_BASE_URL'] = '';

      const result = storage.load();

      expect(result.baseUrl).toBe('https://test.atlassian.net');
    });

    it('throws AppError naming the missing field when baseUrl is missing', () => {
      expect(() => storage.load()).toThrow(AppError);
      expect(() => storage.load()).toThrow('missing credential: base URL');
    });

    it('throws AppError naming the missing field when email is missing', () => {
      process.env['ATLASSIAN_BASE_URL'] = 'https://test.atlassian.net';

      expect(() => storage.load()).toThrow('missing credential: email');
    });

    it('throws AppError naming the missing field when apiToken is missing', () => {
      process.env['ATLASSIAN_BASE_URL'] = 'https://test.atlassian.net';
      process.env['ATLASSIAN_EMAIL'] = 'user@example.com';

      expect(() => storage.load()).toThrow('missing credential: API token');
    });

    it('throws AppError on malformed JSON in credentials file', () => {
      fs.writeFileSync(path.join(tmpDir, 'credentials.json'), 'not json{');

      expect(() => storage.load()).toThrow(AppError);
      expect(() => storage.load()).toThrow('invalid credentials file: malformed JSON');
    });

    it('throws AppError on missing fields in credentials file', () => {
      fs.writeFileSync(path.join(tmpDir, 'credentials.json'), JSON.stringify({ baseUrl: 'https://test.atlassian.net' }));

      expect(() => storage.load()).toThrow(AppError);
      expect(() => storage.load()).toThrow('invalid credentials file: missing or invalid fields');
    });

    it('throws AppError on wrong field types in credentials file', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'credentials.json'),
        JSON.stringify({ baseUrl: 123, email: 'user@example.com', apiToken: 'token' })
      );

      expect(() => storage.load()).toThrow('invalid credentials file: missing or invalid fields');
    });

    it('does not call keychain functions when not on macOS', () => {
      fs.writeFileSync(path.join(tmpDir, 'credentials.json'), JSON.stringify(validCredentials()));

      storage.load();

      expect(mockKeychain.keychainGet).not.toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('writes credentials to file', () => {
      storage.save(validCredentials());

      const raw = fs.readFileSync(path.join(tmpDir, 'credentials.json'), 'utf-8');
      expect(JSON.parse(raw)).toEqual(validCredentials());
    });

    it('creates directory if it does not exist', () => {
      const nestedDir = path.join(tmpDir, 'nested', 'dir');
      const nestedStorage = new CredentialStorage(nestedDir);

      nestedStorage.save(validCredentials());

      const raw = fs.readFileSync(path.join(nestedDir, 'credentials.json'), 'utf-8');
      expect(JSON.parse(raw)).toEqual(validCredentials());
    });

    it('overwrites existing credentials file', () => {
      storage.save(validCredentials());
      const updated = { baseUrl: 'https://new.atlassian.net', email: 'new@example.com', apiToken: 'new-token' };
      storage.save(updated);

      const raw = fs.readFileSync(path.join(tmpDir, 'credentials.json'), 'utf-8');
      expect(JSON.parse(raw)).toEqual(updated);
    });

    it('does not call keychain functions when not on macOS', () => {
      storage.save(validCredentials());

      expect(mockKeychain.keychainSet).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('removes credentials file and returns true', () => {
      storage.save(validCredentials());

      const result = storage.clear();

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'credentials.json'))).toBe(false);
    });

    it('returns false when no file exists', () => {
      const result = storage.clear();

      expect(result).toBe(false);
    });

    it('re-throws non-ENOENT errors', () => {
      const eacces = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw eacces;
      });

      expect(() => storage.clear()).toThrow(eacces);

      vi.restoreAllMocks();
    });

    it('does not call keychain functions when not on macOS', () => {
      storage.clear();

      expect(mockKeychain.keychainDelete).not.toHaveBeenCalled();
    });
  });

  // ── macOS Keychain ─────────────────────────────────────────

  describe('macOS Keychain', () => {
    beforeEach(() => {
      mockKeychain.isMacOS.mockReturnValue(true);
    });

    describe('save', () => {
      it('writes only baseUrl and email to file', () => {
        storage.save(validCredentials());

        const raw = fs.readFileSync(path.join(tmpDir, 'credentials.json'), 'utf-8');
        const file = JSON.parse(raw) as Record<string, unknown>;
        expect(file['baseUrl']).toBe('https://test.atlassian.net');
        expect(file['email']).toBe('user@example.com');
        expect(file).not.toHaveProperty('apiToken');
      });

      it('stores apiToken in Keychain', () => {
        storage.save(validCredentials());

        expect(mockKeychain.keychainSet).toHaveBeenCalledWith('atl-cli', 'api-token', 'token123');
      });

      it('propagates Keychain errors as AppError', () => {
        mockKeychain.keychainSet.mockImplementation(() => {
          throw new AppError('failed to save API token to Keychain');
        });

        expect(() => storage.save(validCredentials())).toThrow(AppError);
        expect(() => storage.save(validCredentials())).toThrow('failed to save API token to Keychain');
      });
    });

    describe('load', () => {
      it('reads baseUrl and email from file, apiToken from Keychain', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'credentials.json'),
          JSON.stringify({ baseUrl: 'https://test.atlassian.net', email: 'user@example.com' })
        );
        mockKeychain.keychainGet.mockReturnValue('keychain-token');

        const result = storage.load();

        expect(result).toEqual({
          baseUrl: 'https://test.atlassian.net',
          email: 'user@example.com',
          apiToken: 'keychain-token'
        });
      });

      it('env var overrides Keychain for apiToken', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'credentials.json'),
          JSON.stringify({ baseUrl: 'https://test.atlassian.net', email: 'user@example.com' })
        );
        process.env['ATLASSIAN_API_TOKEN'] = 'env-token';

        const result = storage.load();

        expect(result.apiToken).toBe('env-token');
        expect(mockKeychain.keychainGet).not.toHaveBeenCalled();
      });

      it('falls back to file apiToken when Keychain has no entry (migration)', () => {
        fs.writeFileSync(path.join(tmpDir, 'credentials.json'), JSON.stringify(validCredentials()));
        mockKeychain.keychainGet.mockReturnValue(null);

        const result = storage.load();

        expect(result.apiToken).toBe('token123');
      });

      it('throws AppError when apiToken is missing from both Keychain and file', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'credentials.json'),
          JSON.stringify({ baseUrl: 'https://test.atlassian.net', email: 'user@example.com' })
        );
        mockKeychain.keychainGet.mockReturnValue(null);

        expect(() => storage.load()).toThrow(AppError);
        expect(() => storage.load()).toThrow('missing credential: API token');
      });

      it('accepts file with only baseUrl and email on macOS', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'credentials.json'),
          JSON.stringify({ baseUrl: 'https://test.atlassian.net', email: 'user@example.com' })
        );
        mockKeychain.keychainGet.mockReturnValue('kc-tok');

        const result = storage.load();

        expect(result.baseUrl).toBe('https://test.atlassian.net');
        expect(result.email).toBe('user@example.com');
        expect(result.apiToken).toBe('kc-tok');
      });
    });

    describe('clear', () => {
      it('removes both file and Keychain entry', () => {
        storage.save(validCredentials());
        mockKeychain.keychainDelete.mockReturnValue(true);

        const result = storage.clear();

        expect(result).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'credentials.json'))).toBe(false);
        expect(mockKeychain.keychainDelete).toHaveBeenCalledWith('atl-cli', 'api-token');
      });

      it('returns true when only Keychain entry exists', () => {
        mockKeychain.keychainDelete.mockReturnValue(true);

        const result = storage.clear();

        expect(result).toBe(true);
      });

      it('returns true when only file exists', () => {
        storage.save(validCredentials());
        mockKeychain.keychainDelete.mockReturnValue(false);

        const result = storage.clear();

        expect(result).toBe(true);
      });

      it('returns false when neither file nor Keychain entry exists', () => {
        mockKeychain.keychainDelete.mockReturnValue(false);

        const result = storage.clear();

        expect(result).toBe(false);
      });
    });
  });
});
