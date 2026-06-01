
/**
 * Türkiye fiyat formatını parse eder
 * "1.499,90 TL" → 149990 (kuruş)
 * "₺1.499,90" → 149990
 * "1.499,90" → 149990
 * "₺ 1.499,90" → 149990
 */
export function parseTurkishPrice(priceText: string): number {
  if (!priceText || typeof priceText !== 'string') {
    return 0;
  }

  // Temizlik
  let cleaned = priceText
    .trim()
    .replace(/^₺\s*/, '')  // Baştaki ₺ işareti
    .replace(/\s*TL$/i, '') // Sondaki TL
    .replace(/\s+/g, '')    // Boşlukları kaldır
    .replace(/\./g, '')     // Binlik ayracını kaldır
    .replace(',', '.');     // Ondalık ayracını değiştir

  // Sayısal değeri al
  const match = cleaned.match(/^(\d+(?:\.\d+)?)/);
  if (!match) {
    return 0;
  }

  const price = parseFloat(match[1]);
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
export function formatTurkishPrice(priceInKurus: number): string {
  const lira = Math.floor(priceInKurus / 100);
  const kurus = priceInKurus % 100;
  
  const liraStr = lira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const kurusStr = kurus.toString().padStart(2, '0');
  
  return `${liraStr},${kurusStr} TL`;
}