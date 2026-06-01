"use strict";
/**
 * Token Counter — Basit token tahmini
 *
 * Tiktoken bağımlılığı olmadan yaklaşık token sayısı hesaplar.
 * Kural: İngilizce ~4 karakter/token, Türkçe ~3.5 karakter/token
 * Ortalama 3.5 kullanıyoruz çünkü DEHA çoğunlukla Türkçe konuşuyor.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = estimateTokens;
exports.estimateMessagesTokens = estimateMessagesTokens;
exports.getMaxContextTokens = getMaxContextTokens;
var CHARS_PER_TOKEN = 3.5;
// Mesaj başına overhead: role tag + formatting (~4 token)
var MSG_OVERHEAD_TOKENS = 4;
/**
 * Bir metin parçasının yaklaşık token sayısını döner.
 */
function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
/**
 * Bir mesaj dizisinin toplam yaklaşık token sayısını döner.
 * Her mesaj için overhead (role tag vs.) ekler.
 */
function estimateMessagesTokens(messages) {
    return messages.reduce(function (sum, m) { return sum + estimateTokens(m.content) + MSG_OVERHEAD_TOKENS; }, 0);
}
/**
 * Provider'a göre max context window boyutunu döner.
 */
function getMaxContextTokens(provider, model) {
    // Model adına göre bilinen context window'lar
    var modelLower = model.toLowerCase();
    if (modelLower.includes('claude'))
        return 200000;
    if (modelLower.includes('deepseek'))
        return 128000;
    if (modelLower.includes('gpt-4o'))
        return 128000;
    if (modelLower.includes('gpt-4-turbo'))
        return 128000;
    if (modelLower.includes('gpt-4'))
        return 8192;
    if (modelLower.includes('gpt-3.5'))
        return 16385;
    if (modelLower.includes('grok'))
        return 131072;
    if (modelLower.includes('qwen'))
        return 32768;
    if (modelLower.includes('llama3'))
        return 8192;
    if (modelLower.includes('mistral'))
        return 32768;
    if (modelLower.includes('gemma'))
        return 8192;
    // Provider bazlı fallback
    switch (provider.toLowerCase()) {
        case 'claude': return 200000;
        case 'deepseek': return 128000;
        case 'openai': return 128000;
        case 'openrouter': return 128000;
        case 'xai': return 131072;
        case 'ollama': return 8192;
        default: return 32000;
    }
}
