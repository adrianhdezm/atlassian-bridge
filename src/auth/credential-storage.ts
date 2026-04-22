import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { AppError } from '../shared/app-error.js';
import { isMacOS, keychainSet, keychainGet, keychainDelete, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT } from './keychain.js';

const CredentialsSchema = z.object({
  baseUrl: z.string(),
  email: z.string(),
  apiToken: z.string()
});

const FileOnlySchema = z.object({
  baseUrl: z.string(),
  email: z.string()
});

export type Credentials = z.infer<typeof CredentialsSchema>;

const ENV_MAP: { key: keyof Credentials; envVar: string; label: string }[] = [
  { key: 'baseUrl', envVar: 'ATLASSIAN_BASE_URL', label: 'base URL' },
  { key: 'email', envVar: 'ATLASSIAN_EMAIL', label: 'email' },
  { key: 'apiToken', envVar: 'ATLASSIAN_API_TOKEN', label: 'API token' }
];

export class CredentialStorage {
  private readonly filePath: string;
  private readonly configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir ?? path.join(os.homedir(), '.atl-cli');
    this.filePath = path.join(this.configDir, 'credentials.json');
  }

  load(): Credentials {
    const file = this.readFile();
    const result: Partial<Credentials> = {};

    for (const { key, envVar, label } of ENV_MAP) {
      const envValue = process.env[envVar];
      if (envValue !== undefined && envValue !== '') {
        result[key] = envValue;
      } else if (key === 'apiToken' && isMacOS()) {
        const token = keychainGet(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
        if (token !== null) {
          result[key] = token;
        } else if (file !== null && file[key] !== undefined) {
          result[key] = file[key];
        } else {
          throw new AppError(`missing credential: ${label}`);
        }
      } else if (file !== null && file[key] !== undefined) {
        result[key] = file[key];
      } else {
        throw new AppError(`missing credential: ${label}`);
      }
    }

    return result as Credentials;
  }

  save(credentials: Credentials): void {
    fs.mkdirSync(this.configDir, { recursive: true });
    if (isMacOS()) {
      const { baseUrl, email } = credentials;
      fs.writeFileSync(this.filePath, JSON.stringify({ baseUrl, email }, null, 2));
      keychainSet(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, credentials.apiToken);
    } else {
      fs.writeFileSync(this.filePath, JSON.stringify(credentials, null, 2));
    }
  }

  clear(): boolean {
    const fileRemoved = this.removeFile();
    const keychainRemoved = isMacOS() ? keychainDelete(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) : false;
    return fileRemoved || keychainRemoved;
  }

  private removeFile(): boolean {
    try {
      fs.unlinkSync(this.filePath);
      return true;
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  private readFile(): Partial<Credentials> | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError('invalid credentials file: malformed JSON');
    }

    const schema = isMacOS() ? FileOnlySchema.passthrough() : CredentialsSchema;
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new AppError('invalid credentials file: missing or invalid fields');
    }

    return result.data as Partial<Credentials>;
  }
}
