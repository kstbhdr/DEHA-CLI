"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var token_counter_1 = require("../services/token-counter");
(0, vitest_1.describe)('estimateTokens', function () {
    (0, vitest_1.it)('boş metin için 0 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.estimateTokens)('')).toBe(0);
    });
    (0, vitest_1.it)('null/undefined güvenli', function () {
        (0, vitest_1.expect)((0, token_counter_1.estimateTokens)('')).toBe(0);
    });
    (0, vitest_1.it)('kısa bir metnin token sayısını hesaplar', function () {
        // "Merhaba" = 7 karakter / 3.5 = 2
        (0, vitest_1.expect)((0, token_counter_1.estimateTokens)('Merhaba')).toBe(2);
    });
    (0, vitest_1.it)('uzun bir metnin token sayısını hesaplar', function () {
        var text = 'A'.repeat(350); // 350 / 3.5 = 100
        (0, vitest_1.expect)((0, token_counter_1.estimateTokens)(text)).toBe(100);
    });
    (0, vitest_1.it)('yuvarlama doğru çalışır (Math.ceil)', function () {
        // 1 karakter / 3.5 = 0.285 → ceil = 1
        (0, vitest_1.expect)((0, token_counter_1.estimateTokens)('a')).toBe(1);
        // 4 karakter / 3.5 = 1.14 → ceil = 2
        (0, vitest_1.expect)((0, token_counter_1.estimateTokens)('abcd')).toBe(2);
    });
});
(0, vitest_1.describe)('estimateMessagesTokens', function () {
    (0, vitest_1.it)('boş mesaj dizisi için 0 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.estimateMessagesTokens)([])).toBe(0);
    });
    (0, vitest_1.it)('tek mesajın token sayısını overhead ile hesaplar', function () {
        var messages = [{ role: 'user', content: 'Merhaba' }];
        // content: 7/3.5=2 + overhead:4 = 6
        (0, vitest_1.expect)((0, token_counter_1.estimateMessagesTokens)(messages)).toBe(6);
    });
    (0, vitest_1.it)('birden çok mesajın toplam token sayısını hesaplar', function () {
        var messages = [
            { role: 'user', content: 'Merhaba' }, // 2 + 4 = 6
            { role: 'assistant', content: 'Selam' }, // 1.42→2 + 4 = 6
        ];
        (0, vitest_1.expect)((0, token_counter_1.estimateMessagesTokens)(messages)).toBe(12);
    });
});
(0, vitest_1.describe)('getMaxContextTokens', function () {
    (0, vitest_1.it)('Claude için 200_000 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('claude', 'claude-sonnet-4')).toBe(200000);
    });
    (0, vitest_1.it)('DeepSeek için 128_000 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('deepseek', 'deepseek-v4-flash')).toBe(128000);
    });
    (0, vitest_1.it)('GPT-4o için 128_000 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('openai', 'gpt-4o')).toBe(128000);
    });
    (0, vitest_1.it)('GPT-4-turbo için 128_000 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('openai', 'gpt-4-turbo')).toBe(128000);
    });
    (0, vitest_1.it)('GPT-4 (eski) için 8_192 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('openai', 'gpt-4')).toBe(8192);
    });
    (0, vitest_1.it)('GPT-3.5 için 16_385 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('openai', 'gpt-3.5-turbo')).toBe(16385);
    });
    (0, vitest_1.it)('Grok için 131_072 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('xai', 'grok-reasoning')).toBe(131072);
    });
    (0, vitest_1.it)('Ollama için 8_192 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('ollama', 'llama3.2')).toBe(8192);
    });
    (0, vitest_1.it)('Ollama için model adıyla 8_192 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('ollama', 'llama3.2:latest')).toBe(8192);
    });
    (0, vitest_1.it)('provider bazlı fallback çalışır (openrouter)', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('openrouter', 'unknown-model')).toBe(128000);
    });
    (0, vitest_1.it)('bilinmeyen provider/model için varsayılan 32_000 döndürür', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('custom', 'custom-model')).toBe(32000);
    });
    (0, vitest_1.it)('büyük/küçük harf duyarsız çalışır', function () {
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('OpenAI', 'GPT-4O')).toBe(128000);
        (0, vitest_1.expect)((0, token_counter_1.getMaxContextTokens)('DEEPSEEK', 'DEEPSEEK-V4')).toBe(128000);
    });
});
