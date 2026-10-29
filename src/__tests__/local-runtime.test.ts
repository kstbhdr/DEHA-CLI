import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { executeTool, executeToolAsync } from '../tools';
import { parseCommandArgs } from '../services/command-args';
import { runCommand } from '../tools/terminal';
import { getConfig } from '../config';
import * as agent from '../commands/agent';
import { runPlanner } from '../pipeline/planner';
import { computeSectionBudgets } from '../services/sectioned-context/budget';
import * as ai from '../services/ai-service';
import { resetSession } from '../services/session-memory';

vi.mock('inquirer', () => ({ default: { prompt: vi.fn(async () => ({ action: 'cancel' })) } }));
afterEach(() => vi.restoreAllMocks());

describe('Yerel geliştirme regresyonları', () => {
  it('git aracına eklenen shell komutunu çalıştırmaz', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-git-'));
    execFileSync('git', ['init', '--quiet', dir]);
    await executeToolAsync('git', { cwd: dir, command: 'status --short & echo injected > injected.txt' });
    expect(fs.existsSync(path.join(dir, 'injected.txt'))).toBe(false);
  });
  it('git branch silme işlemi salt okunur sayılmaz', async () => {
    const result = await executeToolAsync('git', { command: 'branch -D example' });
    expect(result).toContain('Kullanıcı git işlemini iptal etti');
  });
  it('tırnaklı Git argümanlarını ve Windows yollarını korur', () => {
    expect(parseCommandArgs('diff -- "C:\\my project\\file.ts"')).toEqual(['diff', '--', 'C:\\my project\\file.ts']);
    expect(parseCommandArgs('log --format="%h %s"')).toEqual(['log', '--format=%h %s']);
    expect(() => parseCommandArgs('log "oops')).toThrow('tırnak');
  });
  it('aynı önekli kardeş dizini proje içinde saymaz', async () => {
    const result = await executeToolAsync('run_shell', { command: 'echo should-not-run', cwd: process.cwd() + '-sibling' });
    expect(result).toContain('proje dışına çıkamaz');
  });
  it('CLI dışında seçilen aktif projeye dosya yazar ve aynı projede çalıştırır', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-external-project-'));
    await resetSession(project);
    const file = path.join(project, 'backend.cjs');
    const written = await executeToolAsync('write_file', { path: file, content: 'console.log("PROJECT_EXEC_OK")' });
    expect(written).toContain('Dosya yazıldı');
    expect(fs.readFileSync(file, 'utf8')).toContain('PROJECT_EXEC_OK');
    const executed = await executeToolAsync('run_shell', { command: `"${process.execPath}" backend.cjs`, cwd: project });
    expect(executed).toContain('PROJECT_EXEC_OK');
    expect(executed).not.toContain('HATA:');
  });
  it('göreli dosya yolları CLI klasörüne değil aktif projeye gider', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-relative-project-'));
    await resetSession(project);
    const name = `.deha-probe-${Date.now()}.cjs`;
    try {
      await executeToolAsync('write_file', { path: name, content: 'console.log("RELATIVE_OK")' });
      expect(fs.existsSync(path.join(project, name))).toBe(true);
      expect(executeTool('read_file', { path: name })).toContain('RELATIVE_OK');
    } finally {
      // Only the unique probe file can have been created in the old wrong cwd.
      const misplaced = path.join(process.cwd(), name);
      if (fs.existsSync(misplaced)) fs.unlinkSync(misplaced);
    }
  });
  it('planner gerçek rol sağlayıcısını, modelini ve endpointini kullanır', async () => {
    const config = getConfig({ provider: 'openai' });
    config.pipeline.planner = { provider: 'custom', model: 'planner-model', apiUrl: 'http://localhost:1234/v1', apiKey: 'test', maxTokens: 512 };
    const run = vi.spyOn(agent, 'runAgent').mockResolvedValue({ response: 'plan', messages: [] });
    await runPlanner('planla', config);
    expect(run.mock.calls[0][1]).toMatchObject({ provider: 'custom', customModel: 'planner-model', roleOverride: config.pipeline.planner, toolMaxTokens: 512 });
  });
  it('dolu sabit bağlamın üzerine hayali 4000 token bütçe eklemez', () => {
    expect(() => computeSectionBudgets(64000, 60000, { outputReserve: 16000 })).toThrow('Bağlam bütçesi yetersiz');
  });
  it('API çıktı limiti assembler tarafından ayrılan rezervi aşmaz', async () => {
    await resetSession(fs.mkdtempSync(path.join(os.tmpdir(), 'deha-budget-')));
    const send = vi.spyOn(ai, 'sendWithToolsOpenAICompat').mockResolvedValue({ text: 'Bitti [STATUS: COMPLETE]', toolCalls: [], rawAssistantMsg: { role: 'assistant', content: 'Bitti [STATUS: COMPLETE]' }, malformedToolCalls: 0, finishReason: 'stop' });
    await agent.runAgent('Kısa test', getConfig({ provider: 'deepseek', toolMaxTokens: 48000, maxContextTokens: 64000 }), [], undefined, undefined, undefined, { sectioned: true });
    expect(send.mock.calls[0][1].toolMaxTokens).toBeLessThanOrEqual(16000);
  });
  it('aşırı komut çıktısını sınırlayarak belleğin şişmesini önler', async () => {
    await expect(runCommand(`"${process.execPath}" -e "process.stdout.write('x'.repeat(20000))"`, { maxBuffer: 1024 })).rejects.toThrow('maxBuffer');
  });
  it('iptal edilen shell alt işlemi sonradan dosya yazmaya devam etmez', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-cancel-'));
    const marker = path.join(dir, 'late.txt');
    const controller = new AbortController();
    const result = runCommand(`"${process.execPath}" -e "setTimeout(()=>require('fs').writeFileSync('late.txt','late'),900)"`, { cwd: dir, signal: controller.signal });
    const check = expect(result).rejects.toThrow('durduruldu');
    setTimeout(() => controller.abort(), 200);
    await check;
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(fs.existsSync(marker)).toBe(false);
  });
  // Son sırada: autoAllowDangerousCommands'ı kalıcı true yapar, sonraki
  // testlerin prompt'u görmesini engeller.
  it('onay prompt\'u süresinde yanıtlanmazsa "her şeye izin ver" sayılır', async () => {
    const inquirer = await import('inquirer');
    vi.mocked(inquirer.default.prompt).mockImplementationOnce(() => new Promise(() => {}) as any);
    vi.useFakeTimers();
    try {
      const resultPromise = executeToolAsync('git', { command: 'branch -D deha-onay-zaman-asimi-test' });
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
      const result = await resultPromise;
      expect(result).not.toContain('Kullanıcı git işlemini iptal etti');
    } finally {
      vi.useRealTimers();
    }
  });
});
