
import { Page } from 'playwright';
import { BaseParser } from './base-parser';
import { Product } from '../../types/shopping';

export class HepsiburadaParser extends BaseParser {
  protected storeName = 'hepsiburada';
  protected baseUrl = 'https://www.hepsiburada.com';
  protected searchPath = '/ara?q=';

  getSearchUrl(query: string): string {
    return `${this.baseUrl}${this.searchPath}${encodeURIComponent(query)}`;
  }

  async parseProductList(page: Page): Promise<Product[]> {
    const products: Product[] = [];

    try {
      await page.waitForSelector('[class*="product-card"], [class*="productItem"]', { timeout: 10000 });
      
      const items = await page.$$('[class*="product-card"], [class*="productItem"]');
      
      for (const item of items) {
        try {
          const name = await item.$eval('[class*="product-name"], [class*="title"]', 
            (el) => el.textContent?.trim() || '');
          
          const priceText = await item.$eval('[class*="price"], [class*="current-price"]', 
            (el) => el.textContent?.trim() || '');
          
          const url = await item.$eval('a', (el) => el.getAttribute('href') || '');
          
          const imageUrl = await item.$eval('img', (el) => el.getAttribute('src') || '');
          
          if (name && priceText) {
            products.push(this.createProduct({
              name,
              priceText,
              url,
              imageUrl: imageUrl?.startsWith('//') ? `https:${imageUrl}` : imageUrl
            }));
          }
        } catch (itemError) {
          console.error(`[Hepsiburada] Ürün parse hatası:`, itemError);
          continue;
        }
      }
    } catch (error) {
      console.error(`[Hepsiburada] Liste parse hatası:`, error);
    }

    return products;
  }
}