"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var fs = require("fs");
vitest_1.vi.mock('fs', function () { return ({
    existsSync: vitest_1.vi.fn(),
    readFileSync: vitest_1.vi.fn(),
    writeFileSync: vitest_1.vi.fn(),
    mkdirSync: vitest_1.vi.fn(),
}); });
var usage_tracker_1 = require("../services/usage-tracker");
function makeConfig(overrides) {
    if (overrides === void 0) { overrides = {}; }
    return __assign({ provider: 'openai', anthropicApiKey: '', openaiApiKey: '', deepseekApiKey: '', openrouterApiKey: '', xaiApiKey: '', customApiKey: '', deepseekThinking: 'disabled', deepseekReasoningEffort: 'high', claudeModel: 'claude-opus-4-6', openaiModel: 'gpt-4o', deepseekModel: 'deepseek-chat', openrouterModel: 'anthropic/claude-opus-4', xaiModel: 'grok-3', customModel: 'local-model', ollamaHost: 'http://localhost:11434', ollamaModel: 'llama3', customApiUrl: 'http://localhost:8080/v1', visionProvider: 'claude', visionModel: 'claude-opus-4-6', chatInputPrice: 3, chatOutputPrice: 15, plannerInputPrice: 3, plannerOutputPrice: 15, coderInputPrice: 0.27, coderOutputPrice: 1.10, judgeInputPrice: 5, judgeOutputPrice: 15, visionInputPrice: 3, visionOutputPrice: 15, agentInputPrice: 3, agentOutputPrice: 15, systemPrompt: '', maxTokens: 4096, temperature: 0.7, maxToolRounds: 200, toolMaxTokens: 49152, maxContextTokens: 0, compressThreshold: 0.75, minHotMessages: 10, pipeline: {} }, overrides);
}
(0, vitest_1.describe)('calcCost', function () {
    var config = makeConfig();
    (0, vitest_1.it)('chat rolunde dogru maliyeti hesaplar', function () {
        var cost = (0, usage_tracker_1.calcCost)('chat', 1000000, 500000, config);
        // 1M input * $3/M + 0.5M output * $15/M = 3 + 7.5 = 10.5
        (0, vitest_1.expect)(cost).toBeCloseTo(10.5, 4);
    });
    (0, vitest_1.it)('coder rolunde dogru maliyeti hesaplar', function () {
        var cost = (0, usage_tracker_1.calcCost)('coder', 1000000, 200000, config);
        // 1M * $0.27/M + 0.2M * $1.10/M = 0.27 + 0.22 = 0.49
        (0, vitest_1.expect)(cost).toBeCloseTo(0.49, 4);
    });
    (0, vitest_1.it)('judge rolunde dogru maliyeti hesaplar', function () {
        var cost = (0, usage_tracker_1.calcCost)('judge', 500000, 100000, config);
        // 0.5M * $5/M + 0.1M * $15/M = 2.5 + 1.5 = 4.0
        (0, vitest_1.expect)(cost).toBeCloseTo(4.0, 4);
    });
    (0, vitest_1.it)('sifir token icin 0 maliyet', function () {
        (0, vitest_1.expect)((0, usage_tracker_1.calcCost)('chat', 0, 0, config)).toBe(0);
    });
});
(0, vitest_1.describe)('recordUsage', function () {
    var config = makeConfig();
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ entries: [] }));
    });
    (0, vitest_1.it)('kullanim kaydeder', function () {
        (0, usage_tracker_1.recordUsage)('openai', 'gpt-4o', 'chat', 1000, 500, config);
        (0, vitest_1.expect)(fs.writeFileSync).toHaveBeenCalledTimes(1);
        var written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
        (0, vitest_1.expect)(written.entries).toHaveLength(1);
        (0, vitest_1.expect)(written.entries[0].role).toBe('chat');
        (0, vitest_1.expect)(written.entries[0].provider).toBe('openai');
        (0, vitest_1.expect)(written.entries[0].costUsd).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('sifir token icin kayit yapilmaz', function () {
        (0, usage_tracker_1.recordUsage)('openai', 'gpt-4o', 'chat', 0, 0, config);
        (0, vitest_1.expect)(fs.writeFileSync).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('mevcut girdilere ekleme yapar', function () {
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            entries: [{ timestamp: '2024-01-01', provider: 'old', model: 'x', role: 'chat', inputTokens: 100, outputTokens: 50, costUsd: 0.01 }],
        }));
        (0, usage_tracker_1.recordUsage)('openai', 'gpt-4o', 'coder', 200, 100, config);
        var written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
        (0, vitest_1.expect)(written.entries).toHaveLength(2);
    });
    (0, vitest_1.it)('thinking tokenlarini ayri saklar ve output maliyetine dahil eder', function () {
        (0, usage_tracker_1.recordUsage)('deepseek', 'deepseek-reasoner', 'chat', 1000, 700, config, 300);
        var written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
        (0, vitest_1.expect)(written.entries[0].outputTokens).toBe(700);
        (0, vitest_1.expect)(written.entries[0].reasoningTokens).toBe(300);
        (0, vitest_1.expect)(written.entries[0].costUsd).toBeCloseTo((0, usage_tracker_1.calcCost)('chat', 1000, 700, config), 6);
    });
    (0, vitest_1.it)('10000 girdi sinirini korur', function () {
        var oldEntries = Array.from({ length: 10000 }, function (_, i) { return ({
            timestamp: new Date(2020, 0, 1 + i).toISOString(),
            provider: 'test', model: 'm', role: 'chat',
            inputTokens: 1, outputTokens: 1, costUsd: 0.001,
        }); });
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ entries: oldEntries }));
        (0, usage_tracker_1.recordUsage)('openai', 'gpt-4o', 'chat', 100, 50, config);
        var written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
        (0, vitest_1.expect)(written.entries.length).toBeLessThanOrEqual(10000);
        // En son eklenen kayit en sonda olmali
        (0, vitest_1.expect)(written.entries[written.entries.length - 1].inputTokens).toBe(100);
    });
});
(0, vitest_1.describe)('getStats', function () {
    var config = makeConfig();
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.mocked(fs.existsSync).mockReturnValue(true);
    });
    (0, vitest_1.it)('hic kayit yoksa tum periodlar 0 olur', function () {
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ entries: [] }));
        var stats = (0, usage_tracker_1.getStats)();
        (0, vitest_1.expect)(stats.today.calls).toBe(0);
        (0, vitest_1.expect)(stats.week.calls).toBe(0);
        (0, vitest_1.expect)(stats.month.calls).toBe(0);
        (0, vitest_1.expect)(stats.allTime.calls).toBe(0);
    });
    (0, vitest_1.it)('birden cok kayit icin dogru istatistik hesaplar', function () {
        var now = new Date();
        var today = now.toISOString();
        // lastWeek: ayin 1'inden sonra (month icinde)
        var lastWeek = new Date(now.getTime() - 3 * 86400000).toISOString();
        // lastMonthStart: ayin 1'inden once (month disinda)
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        var beforeMonth = new Date(monthStart.getTime() - 86400000).toISOString();
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            entries: [
                { timestamp: today, provider: 'openai', model: 'gpt-4o', role: 'chat', inputTokens: 1000, outputTokens: 500, costUsd: 0.01 },
                { timestamp: lastWeek, provider: 'deepseek', model: 'ds-chat', role: 'coder', inputTokens: 2000, outputTokens: 1000, costUsd: 0.005 },
                { timestamp: beforeMonth, provider: 'claude', model: 'opus-4', role: 'planner', inputTokens: 500, outputTokens: 200, costUsd: 0.02 },
            ],
        }));
        var stats = (0, usage_tracker_1.getStats)();
        (0, vitest_1.expect)(stats.allTime.calls).toBe(3);
        (0, vitest_1.expect)(stats.today.calls).toBe(1);
        (0, vitest_1.expect)(stats.today.totalTokens).toBe(1500);
        (0, vitest_1.expect)(stats.week.calls).toBe(2); // today + lastWeek (3 gun once hala bu hafta)
        (0, vitest_1.expect)(stats.month.calls).toBe(2); // today + lastWeek (beforeMonth onceki ayda)
    });
    (0, vitest_1.it)('byModel ve byRole gruplamasi calisir', function () {
        vitest_1.vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            entries: [
                { timestamp: new Date().toISOString(), provider: 'openai', model: 'gpt-4o', role: 'chat', inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
                { timestamp: new Date().toISOString(), provider: 'openai', model: 'gpt-4o', role: 'coder', inputTokens: 200, outputTokens: 100, costUsd: 0.02 },
            ],
        }));
        var stats = (0, usage_tracker_1.getStats)();
        (0, vitest_1.expect)(Object.keys(stats.allTime.byModel)).toContain('openai/gpt-4o');
        (0, vitest_1.expect)(Object.keys(stats.allTime.byRole)).toContain('chat');
        (0, vitest_1.expect)(Object.keys(stats.allTime.byRole)).toContain('coder');
        (0, vitest_1.expect)(stats.allTime.byModel['openai/gpt-4o'].calls).toBe(2);
    });
});
