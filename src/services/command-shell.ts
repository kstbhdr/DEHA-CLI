import * as fs from 'fs';

/** Model shell examples use Bash features; shell:true alone uses /bin/sh on Unix. */
export function resolveCommandShell(requested: boolean | string = true, platform: string = process.platform): boolean | string {
  if (requested === false || typeof requested === 'string') return requested;
  if (process.env.DEHA_SHELL) return process.env.DEHA_SHELL;
  if (platform !== 'win32' && fs.existsSync('/bin/bash')) return '/bin/bash';
  return true;
}
