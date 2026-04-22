import { execFileSync } from 'node:child_process';
import { AppError } from '../shared/app-error.js';

export const KEYCHAIN_SERVICE = 'atl-cli';
export const KEYCHAIN_ACCOUNT = 'api-token';

export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

export function keychainSet(service: string, account: string, password: string): void {
  try {
    execFileSync('security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w', password], {
      encoding: 'utf-8',
      stdio: ['ignore', 'ignore', 'pipe']
    });
  } catch (err) {
    const stderr = err instanceof Error && 'stderr' in err ? String((err as { stderr: unknown }).stderr).trim() : '';
    throw new AppError(`failed to save API token to Keychain${stderr ? `: ${stderr}` : ''}`);
  }
}

export function keychainGet(service: string, account: string): string | null {
  try {
    const stdout = execFileSync('security', ['find-generic-password', '-s', service, '-a', account, '-w'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

export function keychainDelete(service: string, account: string): boolean {
  try {
    execFileSync('security', ['delete-generic-password', '-s', service, '-a', account], {
      encoding: 'utf-8',
      stdio: ['ignore', 'ignore', 'ignore']
    });
    return true;
  } catch {
    return false;
  }
}
