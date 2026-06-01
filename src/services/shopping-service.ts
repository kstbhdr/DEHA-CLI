
import { Product, SearchOptions, STORE_CONFIGS } from '../types/shopping';
import { BrowserManager } from './browser-manager';
import { BaseParser } from './parsers/base-parser';
import { TrendyolParser } from './parsers/trendyol-parser';
import { HepsiburadaParser } from './parsers/hepsiburada-parser';
import { N11Parser } from './parsers/n11-parser';
import { MediamarktParser } from './parsers/mediamarkt-parser';
import { VatanParser } from './parsers/vatan-parser';
import { TeknosaParser } from './parsers/teknosa-parser';
import { CimriParser } from './parsers/cimri-parser';
import { AkakceParser } from './parsers/akakce-parser';
import { A101Parser } from './parsers/a101-parser';
import { formatTurkishPrice } from '../utils/price-parser';

export class ShoppingService {
  private browserManager: BrowserManager;
  private parsers: Map<string, BaseParser>;

  constructor() {
    this.browserManager = BrowserManager.getInstance();
    this.parsers = new Map();
    this.initializeParsers();
  }

  private initializeParsers(): void {
    const parserInstances: BaseParser[] = [
      new TrendyolParser(),
      new HepsiburadaParser(),
      new N11Parser(),
      new MediamarktParser(),
      new VatanParser(),
      new TeknosaParser(),
      new CimriParser(),
      new AkakceParser(),
      new A101Parser()
    ];

    for (const parser of parserInstances) {
      this.parsers.set(parser['storeName'], parser);
    }
  }

  async search(options: SearchOptions): Promise<Product[]> {
    const { query, stores, minPrice, maxPrice, sortBy, maxResults } = options;
    
    console.log(`\n🔍 "${query}" için alışveriş araması başlatılıyor...\n`);

    // Hangi mağazaları kullanacağımızı belirle
    const activeStores = stores 
      ? STORE_CONFIGS.filter(s => stores.includes(s.name) && s.enabled)
      : STORE_CONFIGS.filter(s => s.enabled);

    if (activeStores.length === 0) {
      console.log('❌ Aktif mağaza bulunamadı.');
      return [];
    }

    console.log(`📦 ${activeStores.length} mağazada aranıyor: ${activeStores.map(s => s.name).join(', ')}\n`);

    // Tüm mağazalarda paralel arama
    const searchPromises = activeStores.map(async (store) => {
      const parser = this.parsers.get(store.name);
      if (!parser) {
        console.warn(`⚠️ ${store.name} için parser bulunamadı`);
        return [];
      }

      try {
        const products = await parser.search(query);
        return products;
      } catch (error) {
        console.error(`❌ ${store.name} hatası:`, error instanceof Error ? error.message : 'Bilinmeyen hata');
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    let allProducts = results.flat();

    // Filtreleme
    if (minPrice !== undefined) {
      allProducts = allProducts.filter(p => p.price >= minPrice * 100);
    }
    if (maxPrice !== undefined) {
      allProducts = allProducts.filter(p => p.price <= maxPrice * 100);
    }

    // Sıralama
    if (sortBy) {
      switch (sortBy) {
        case 'price_asc':
          allProducts.sort((a, b) => a.price - b.price);
          break;
        case 'price_desc':
          allProducts.sort((a, b) => b.price - a.price);
          break;
        case 'relevance':
        default:
          // Varsayılan sıralama (mağaza sırasına göre)
          break;
      }
    }

    // Maksimum sonuç
    if (maxResults && maxResults > 0) {
      allProducts = allProducts.slice(0, maxResults);
    }

    return allProducts;
  }

  async displayResults(products: Product[]): Promise<void> {
    if (products.length === 0) {
      console.log('\n❌ Hiç ürün bulunamadı.');
      return;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Toplam ${products.length} ürün bulundu`);
    console.log(`${'='.repeat(80)}\n`);

    // Mağazalara göre grupla
    const grouped = new Map<string, Product[]>();
    for (const product of products) {
      const storeProducts = grouped.get(product.store) || [];
      storeProducts.push(product);
      grouped.set(product.store, storeProducts);
    }

    for (const [store, storeProducts] of grouped) {
      console.log(`🏪 ${store.toUpperCase()} (${storeProducts.length} ürün)`);
      console.log('-'.repeat(60));

      storeProducts.forEach((product, index) => {
        const priceFormatted = formatTurkishPrice(product.price);
        console.log(`  ${index + 1}. ${product.name}`);
        console.log(`     💰 ${priceFormatted}`);
        if (product.rating) {
          console.log(`     ⭐ ${product.rating.toFixed(1)}${product.reviewCount ? ` (${product.reviewCount} yorum)` : ''}`);
        }
        console.log(`     🔗 ${product.url}`);
        console.log();
      });
    }

    // İstatistikler
    console.log('-'.repeat(60));
    const prices = products.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    
    console.log(`📈 İstatistikler:`);
    console.log(`   En düşük: ${formatTurkishPrice(minPrice)}`);
    console.log(`   En yüksek: ${formatTurkishPrice(maxPrice)}`);
    console.log(`   Ortalama: ${formatTurkishPrice(avgPrice)}`);
    console.log(`${'='.repeat(80)}\n`);
  }

  async close(): Promise<void> {
    await this.browserManager.close();
  }
}