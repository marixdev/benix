/**
 * Command execution utilities
 */

import { $ } from 'bun';

export async function exec(command: string): Promise<string> {
  try {
    const result = await $`sh -c ${command}`.quiet().text();
    return result.trim();
  } catch (error: any) {
    // Return empty string on error, let caller handle
    return '';
  }
}

export async function execWithTimeout(command: string, timeoutMs: number = 30000): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const result = await $`sh -c ${command}`.quiet().text();
    clearTimeout(timeout);
    return result.trim();
  } catch {
    return '';
  }
}

export async function checkCommand(cmd: string): Promise<boolean> {
  try {
    const result = await exec(`command -v ${cmd}`);
    return result.length > 0;
  } catch {
    return false;
  }
}

export async function isRoot(): Promise<boolean> {
  try {
    const uid = await exec('id -u');
    return uid === '0';
  } catch {
    return false;
  }
}
