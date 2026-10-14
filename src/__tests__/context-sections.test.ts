import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runAgent } from '../commands/agent';
import * as aiService from '../services/ai-service';
import * as tools from '../tools';
import { resetSession } from '../services/session-memory';
import { getConfig } from '../config';
import { computeSectionBudgets, parseSectionRatios, DEFAULT_SECTION_RATIOS, truncateMiddle } from '../services/sectioned-context/budget';
import { executeBrainTool, renderBrain } from '../services/sectioned-context/brain';
import { getWorkspace } from '../services/sectioned-context/store';
import { recordChange, renderChanges } from '../services/sectioned-context/change-ledger';
import { summarizeToolResult, renderToolLog } from '../services/sectioned-context/tool-log';
import { messagesTokens } from '../services/sectioned-context/assembler';
import type { ChangeRecord, ToolLogEntry } from '../services/sectioned-context/store';

// Diğer test dosyalarıyla paralel çalışırken aynı .deha/session-buffer.json'a
// yazmamak için izole dizin.
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'deha-ctx-'));

describe('Bölümlü context — bütçe', () => {
  it.each([64_000, 128_000, 256_000])('%i context oranla bölünür', (total) => {
    const b = computeSectionBudgets(total, 10_000);
    expect(b.task + b.plan + b.changes + b.tools).toBe(b.sections);
    expect(b.outputReserve + b.safetyReserve + b.fixedPrefix + b.sections).toBeLessThanOrEqual(total);
    expect(b.task / b.sections).toBeCloseTo(0.05, 2);
    expect(b.plan / b.sections).toBeCloseTo(0.15, 2);
    expect(b.changes / b.sections).toBeCloseTo(0.10, 2);
    expect(b.tools / b.sections).toBeCloseTo(0.70, 2);
  });

  it('256k bütçesi 64k bütçesinden orantılı büyüktür', () => {
    const small = computeSectionBudgets(64_000, 8_000);
    const big = computeSectionBudgets(256_000, 8_000);
    expect(big.tools).toBeGreaterThan(small.tools * 3);
  });

  it('DEHA_CTX_RATIOS ayrıştırılır, geçersizse varsayılana döner', () => {
    expect(parseSectionRatios('10,20,10,60')).toEqual({ task: 10, plan: 20, changes: 10, tools: 60 });
    expect(parseSectionRatios('abc')).toEqual(DEFAULT_SECTION_RATIOS);
    expect(parseSectionRatios('1,2,3')).toEqual(DEFAULT_SECTION_RATIOS);
    expect(parseSectionRatios(undefined)).toEqual(DEFAULT_SECTION_RATIOS);
  });

  it('truncateMiddle baş ve sonu korur', () => {
    const s = 'BAŞ' + 'x'.repeat(5000) + 'SON';
    const t = truncateMiddle(s, 500);
    expect(t.length).toBeLessThanOrEqual(500);
    expect(t.startsWith('BAŞ')).toBe(true);
    expect(t.endsWith('SON')).toBe(true);
  });
});

describe('Bölümlü context — brain', () => {
  beforeEach(async () => { await resetSession(TEST_DIR); });
  afterEach(async () => { await resetSession(TEST_DIR); });

  it('plan, adım güncelleme, bulgu ve çıkmaz sokak kaydeder', () => {
    expect(executeBrainTool({ action: 'set_plan', steps: ['Veriyi yükle', 'Solver yaz', 'Test et'] })).toContain('3 adım');
    executeBrainTool({ action: 'update_step', index: 1, status: 'done' });
    executeBrainTool({ action: 'update_step', index: 2, status: 'doing' });
    executeBrainTool({ action: 'add_finding', text: 'Task 3 simetri kullanıyor' });
    executeBrainTool({ action: 'add_dead_end', text: 'BFS flood-fill: renk 0 arka plan değil, başarısız' });
    const b = getWorkspace().brain;
    expect(b.steps.map(s => s.status)).toEqual(['done', 'doing', 'todo']);
    const out = renderBrain(b, 10_000);
    expect(out).toContain('Solver yaz');
    expect(out).toContain('BFS flood-fill');
  });

  it('geçersiz işlemlerde hata döner', () => {
    expect(executeBrainTool({ action: 'update_step', index: 5, status: 'done' })).toMatch(/HATA/);
    expect(executeBrainTool({ action: 'nope' })).toMatch(/HATA/);
  });

  it('küçük bütçede çıkmaz sokaklar en son feda edilir', () => {
    for (let i = 0; i < 40; i++) executeBrainTool({ action: 'add_finding', text: `Bulgu ${i} ` + 'a'.repeat(200) });
    executeBrainTool({ action: 'add_dead_end', text: 'KRİTİK-ÇIKMAZ: rotasyon yaklaşımı' });
    const out = renderBrain(getWorkspace().brain, 400);
    expect(out.length).toBeLessThanOrEqual(400 * 3.5 + 50);
    expect(out).toContain('KRİTİK-ÇIKMAZ');
  });
});

describe('Bölümlü context — değişiklik defteri', () => {
  it('aynı dosyaya yapılan düzenlemeleri birleştirir', () => {
    const changes: ChangeRecord[] = [];
    recordChange(changes, 'write_file', { path: 'solver.py', content: 'a\nb\nc' }, 'OK', 1);
    recordChange(changes, 'edit_file', { path: 'solver.py', old_string: 'a', new_string: 'x\ny' }, 'OK', 2, 'renk eşlemesi düzeltildi');
    recordChange(changes, 'read_file', { path: 'solver.py' }, 'a\nb', 3);
    recordChange(changes, 'run_shell', { command: 'pip install numpy' }, 'ok', 4);
    recordChange(changes, 'run_shell', { command: 'ls -la' }, 'ok', 5);
    recordChange(changes, 'edit_file', { path: 'x.py', old_string: 'a', new_string: 'b' }, 'HATA: bulunamadı', 6);
    expect(changes).toHaveLength(2);
    const solver = changes.find(c => c.path === 'solver.py')!;
    expect(solver.edits).toBe(2);
    expect(solver.added).toBe(5);
    const out = renderChanges(changes, 2_000);
    expect(out).toContain('renk eşlemesi düzeltildi');
    expect(out).toContain('pip install numpy');
  });
});

describe('Bölümlü context — tool günlüğü', () => {
  it('traceback son satırını özetler ve hata işaretler', () => {
    const r = summarizeToolResult('run_shell', 'Traceback (most recent call last):\n  File "s.py", line 3\nValueError: grid shape mismatch\nexit code: 1');
    expect(r.ok).toBe(false);
    expect(r.summary).toContain('ValueError: grid shape mismatch');
    expect(r.summary).toContain('exit 1');
  });

  it('metrik satırlarını yakalar', () => {
    const r = summarizeToolResult('run_shell', 'loading...\nrunning 120 tasks\nsolved 37/120\naccuracy 30.8%');
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('37/120');
    expect(r.summary).toContain('30.8%');
  });

  it('bütçe aşılınca eski kayıtları gruplar, yenileri tek tek tutar', () => {
    const entries: ToolLogEntry[] = Array.from({ length: 200 }, (_, i) => ({
      seq: i + 1, turn: 1, turnIndex: i, name: i % 2 ? 'run_shell' : 'read_file',
      args: `python solver.py --task ${i}`, purpose: 'deneme', summary: `sonuç ${i} ` + 'z'.repeat(60), ok: i % 7 !== 0,
    }));
    const out = renderToolLog(entries, 1_500);
    expect(out.length).toBeLessThanOrEqual(1_500 * 3.5);
    expect(out).toContain('#200 ');
    expect(out).toMatch(/çağrı|arşivlendi/);
  });
});

describe('Bölümlü context — uzun ARC görevi (runAgent sectioned)', () => {
  const TASK = 'ARC-AGI-2 eval setindeki tüm taskları çöz ve skoru raporla';
  const TOTAL = 64_000;
  const ROUNDS = 18;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetSession(TEST_DIR);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await resetSession(TEST_DIR);
  });

  it('görev her istekte var, istek bütçeyi aşmıyor, tool çiftleri geçerli', async () => {
    const config = { ...getConfig({ provider: 'deepseek' }), maxContextTokens: TOTAL };

    vi.spyOn(tools, 'executeTool').mockImplementation((name: string, input: Record<string, unknown>) => {
      if (name === 'brain') return executeBrainTool(input);
      return `solving task...\n${'grid row 0 1 2 3 4 5 6 7 8 9\n'.repeat(1200)}solved 3/10\nexit code: 0`;
    });

    const requests: any[][] = [];
    let call = 0;
    vi.spyOn(aiService, 'sendWithToolsOpenAICompat').mockImplementation(async (messages: any[]) => {
      requests.push(JSON.parse(JSON.stringify(messages)));
      call++;
      if (call === 1) {
        const args = { action: 'set_plan', steps: ['Taskları yükle', 'Solver çalıştır', 'Skoru raporla'] };
        return {
          text: '', toolCalls: [{ id: 'c_brain', name: 'brain', input: args }],
          rawAssistantMsg: { role: 'assistant', content: '', tool_calls: [{ id: 'c_brain', type: 'function', function: { name: 'brain', arguments: JSON.stringify(args) } }] },
          malformedToolCalls: 0, finishReason: 'tool_calls',
        } as any;
      }
      if (call <= ROUNDS) {
        const id = `c_${call}`;
        const args = { command: `python solver_v8.py --task ${call}` };
        return {
          text: `Task ${call} deneniyor`, toolCalls: [{ id, name: 'run_shell', input: args }],
          rawAssistantMsg: { role: 'assistant', content: `Task ${call} deneniyor`, tool_calls: [{ id, type: 'function', function: { name: 'run_shell', arguments: JSON.stringify(args) } }] },
          malformedToolCalls: 0, finishReason: 'tool_calls',
        } as any;
      }
      return {
        text: 'Tüm tasklar denendi, skor 3/10. [STATUS: COMPLETE]', toolCalls: [],
        rawAssistantMsg: { role: 'assistant', content: 'Tüm tasklar denendi, skor 3/10. [STATUS: COMPLETE]' },
        malformedToolCalls: 0, finishReason: 'stop',
      } as any;
    });

    await runAgent(TASK, config, [{ role: 'user', content: TASK }], undefined, undefined, undefined, { sectioned: true });

    expect(requests.length).toBeGreaterThanOrEqual(ROUNDS);
    const schemaTokens = Math.ceil(JSON.stringify(tools.DEHA_TOOLS).length / 3.5);

    let stablePairs = 0;
    for (let r = 0; r < requests.length; r++) {
      const req = requests[r];
      // 1. Görev her istekte <task> bölümünde
      expect(req.some(m => typeof m.content === 'string' && m.content.includes('<task>') && m.content.includes(TASK))).toBe(true);
      // 2. Brain en sonda
      const last = req[req.length - 1];
      expect(last.role).toBe('user');
      expect(String(last.content)).toContain('<brain>');
      if (r >= 2) expect(String(last.content)).toContain('Solver çalıştır');
      // 3. Bütçe
      expect(messagesTokens(req) + schemaTokens).toBeLessThanOrEqual(TOTAL);
      // 4. Her tool mesajının eşleşen assistant tool_call'ı var
      for (let i = 0; i < req.length; i++) {
        if (req[i].role !== 'tool') continue;
        let j = i - 1;
        while (j >= 0 && req[j].role === 'tool') j--;
        const ids = (req[j]?.tool_calls ?? []).map((tc: any) => tc.id);
        expect(ids).toContain(req[i].tool_call_id);
      }
      // 5. Önek stabilitesi (önbellek dostu)
      if (r > 0) {
        const prev = requests[r - 1].slice(0, -1);
        if (JSON.stringify(req.slice(0, prev.length)) === JSON.stringify(prev)) stablePairs++;
      }
    }
    expect(stablePairs).toBeGreaterThanOrEqual(Math.floor((requests.length - 1) / 2));

    // Eski round'lar tool günlüğünde özetlendi; brain çağrısı günlükte yok
    const ws = getWorkspace();
    expect(ws.toolLog.length).toBe(ROUNDS - 1);
    expect(ws.toolLog.every(e => e.name !== 'brain')).toBe(true);
    const lastReq = requests[requests.length - 1];
    expect(lastReq.some((m: any) => typeof m.content === 'string' && m.content.includes('<work_log>'))).toBe(true);
  }, 30_000);
});
