"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTurkishPrice = parseTurkishPrice;
exports.formatTurkishPrice = formatTurkishPrice;
/**
 * Türkiye fiyat formatını parse eder
 * "1.499,90 TL" → 149990 (kuruş)
 * "₺1.499,90" → 149990
 * "1.499,90" → 149990
 * "₺ 1.499,90" → 149990
 */
function parseTurkishPrice(priceText) {
    if (!priceText || typeof priceText !== 'string') {
        return 0;
    }
    // Temizlik
    var cleaned = priceText
        .trim()
        .replace(/^₺\s*/, '') // Baştaki ₺ işareti
        .replace(/\s*TL$/i, '') // Sondaki TL
        .replace(/\s+/g, '') // Boşlukları kaldır
        .replace(/\./g, '') // Binlik ayracını kaldır
        .replace(',', '.'); // Ondalık ayracını değiştir
    // Sayısal değeri al
    var match = cleaned.match(/^(\d+(?:\.\d+)?)/);
    if (!match) {
        return 0;
    }
    var price = parseFloat(match[1]);
    if (isNaN(price)) {
        return 0;
    }
    // Kuruş cinsine çevir (2 ondalık)
    return Math.round(price * 100);
}
/**
 * Kuruş cinsinden fiyatı görüntüleme formatına çevirir
 * 149990 → "1.499,90 TL"
 */
function formatTurkishPrice(priceInKurus) {
    var lira = Math.floor(priceInKurus / 100);
    var kurus = priceInKurus % 100;
    var liraStr = lira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var kurusStr = kurus.toString().padStart(2, '0');
    return "".concat(liraStr, ",").concat(kurusStr, " TL");
}
