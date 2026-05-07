import { describe, it, expect } from 'vitest';
import { isSafeCommand } from '../tools/index';

describe('isSafeCommand — güvenlik filtresi', () => {
  it('güvenli komutlar geçer', () => {
    expect(isSafeCommand('ls -la').safe).toBe(true);
    expect(isSafeCommand('npm run build').safe).toBe(true);
    expect(isSafeCommand('git status').safe).toBe(true);
    expect(isSafeCommand('cat package.json').safe).toBe(true);
    expect(isSafeCommand('npx tsc --noEmit').safe).toBe(true);
  });

  it('rm -rf / engellenir', () => {
    const result = isSafeCommand('rm -rf /');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('engellendi');
  });

  it('rm -rf /* engellenir', () => {
    expect(isSafeCommand('rm -rf /*').safe).toBe(false);
  });

  it('rm -rf ~ engellenir', () => {
    expect(isSafeCommand('rm -rf ~').safe).toBe(false);
  });

  it('dd if= engellenir', () => {
    expect(isSafeCommand('dd if=/dev/zero of=/dev/sda').safe).toBe(false);
  });

  it('mkfs engellenir', () => {
    expect(isSafeCommand('mkfs.ext4 /dev/sda1').safe).toBe(false);
  });

  it('fdisk engellenir', () => {
    expect(isSafeCommand('fdisk /dev/sda').safe).toBe(false);
  });

  it('format (Windows) engellenir', () => {
    expect(isSafeCommand('format C: /fs:NTFS').safe).toBe(false);
  });

  it('shutdown engellenir', () => {
    expect(isSafeCommand('shutdown /s /t 0').safe).toBe(false);
  });

  it('fork bomb engellenir', () => {
    expect(isSafeCommand(':(){ :|:& };:').safe).toBe(false);
  });

  it('chmod 777 / engellenir', () => {
    expect(isSafeCommand('chmod 777 /').safe).toBe(false);
  });

  it('chown engellenir', () => {
    expect(isSafeCommand('chown nobody /').safe).toBe(false);
  });

  it('shred engellenir', () => {
    expect(isSafeCommand('shred -n 3 /dev/sda').safe).toBe(false);
  });

  it('komut 2000 karakterden uzunsa engellenir', () => {
    const longCmd = 'echo ' + 'a'.repeat(2000);
    const result = isSafeCommand(longCmd);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('çok uzun');
  });

  it('normal grep format_ isimleri engellenmez (false positive)', () => {
    expect(isSafeCommand('grep -r "format_" src/').safe).toBe(true);
    expect(isSafeCommand('grep "format_currency" file.ts').safe).toBe(true);
    expect(isSafeCommand('cat file.ts | grep format_').safe).toBe(true);
  });

  it('normal rm komutları (relative path) engellenmez', () => {
    expect(isSafeCommand('rm file.txt').safe).toBe(true);
    expect(isSafeCommand('rm -rf ./dist').safe).toBe(true);
    expect(isSafeCommand('rm -rf node_modules').safe).toBe(true);
  });
});
