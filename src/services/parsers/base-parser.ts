
import { Page } from 'playwright';
import { Product } from '../../types/shopping';
import { parseTurkishPrice } from '../../utils/price-parser';
import { BrowserManager } from '../browser-manager';

export abstract class BaseParser {
  protected browserManager: BrowserManager;
  protected abstract storeName: string;
  protected abstract baseUrl: string;
  protected abstract searchPath: string;

  constructor() {
    this.browserManager = BrowserManager.getInstance();
  }

  abstract getSearchUrl(query: string): string;
  abstract parseProductList(page: Page): Promise<Product[]>;

  async search(query: string): Promise<Product[]> {
    const page = await this.browserManager.getPage();
    
    try {
      await this.browserManager.waitForRateLimit(this.storeName);
      
      const searchUrl = this.getSearchUrl(query);
      console.log(`[${this.storeName}] Aranıyor: ${searchUrl}`);
      
      await page.goto(searchUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      await this.browserManager.randomDelay(500, 1500);

      // Rastgele scroll yap (bot tespitini önle)
      await this.randomScroll(page);

      const products = await this.parseProductList(page);
      console.log(`[${this.storeName}] ${products.length} ürün bulundu`);
      
      return products;
    } catch (error) {
      console.error(`[${this.storeName}] Hata:`, error instanceof Error ? error.message : 'Bilinmeyen hata');
      return [];
    } finally {
      await page.close();
    }
  }

  protected async randomScroll(page: Page): Promise<void> {
    // @ts-ignore
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const scrolls = Math.floor(Math.random() * 3) + 1;
    
    for (let i = 0; i < scrolls; i++) {
      const scrollPosition = Math.floor(Math.random() * scrollHeight * 0.7);
      // @ts-ignore
      await page.evaluate((pos) => window.scrollTo(0, pos), scrollPosition);
      await this.browserManager.randomDelay(200, 800);
    }
  }

  protected parsePrice(priceText: string): number {
    return parseTurkishPrice(priceText);
  }

  protected createProduct(data: {
    name: string;
    priceText: string;
    url: string;
    imageUrl?: string;
    rating?: number;
    reviewCount?: number;
    inStock?: boolean;
    shipping?: string;
    category?: string;
  }): Product {
    return {
      name: data.name.trim(),
      price: this.parsePrice(data.priceText),
      priceText: data.priceText.trim(),
      currency: 'TL',
      store: this.storeName,
      url: data.url.startsWith('http') ? data.url : `${this.baseUrl}${data.url}`,
      imageUrl: data.imageUrl,
      rating: data.rating,
      reviewCount: data.reviewCount,
      inStock: data.inStock ?? true,
      shipping: data.shipping,
      category: data.category
    };
  }
}