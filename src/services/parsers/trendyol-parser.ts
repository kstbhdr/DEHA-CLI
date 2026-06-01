
import { Page } from 'playwright';
import { BaseParser } from './base-parser';
import { Product } from '../../types/shopping';

export class TrendyolParser extends BaseParser {
  protected storeName = 'trendyol';
  protected baseUrl = 'https://www.trendyol.com';
  protected searchPath = '/sr?q=';

  getSearchUrl(query: string): string {
    return `${this.baseUrl}${this.searchPath}${encodeURIComponent(query)}`;
  }

  async parseProductList(page: Page): Promise<Product[]> {
    const products: Product[] = [];

    try {
      // Ürün kartlarını bekle
      await page.waitForSelector('[class*="p-card-wrppr"], [class*="product-card"]', { timeout: 10000 });
      
      const items = await page.$$('[class*="p-card-wrppr"], [class*="product-card"]');
      
      for (const item of items) {
        try {
          const name = await item.$eval('[class*="prdct-desc-cntnr-name"], [class*="product-name"]', 
            (el) => el.textContent?.trim() || '');
          
          const priceText = await item.$eval('[class*="prc-box-dscntd"], [class*="price"]', 
            (el) => el.textContent?.trim() || '');
          
          const url = await item.$eval('a', (el) => el.getAttribute('href') || '');
          
          const imageUrl = await item.$eval('img', (el) => el.getAttribute('src') || '');
          
          const ratingText = await item.$eval('[class*="rating"], [class*="star"]', 
            (el) => el.textContent?.trim()).catch(() => '');
          
          const reviewCountText = await item.$eval('[class*="review-count"], [class*="comment"]', 
            (el) => el.textContent?.trim()).catch(() => '');
          
          if (name && priceText) {
            products.push(this.createProduct({
              name,
              priceText,
              url,
              imageUrl: imageUrl?.startsWith('//') ? `https:${imageUrl}` : imageUrl,
              rating: ratingText ? parseFloat(ratingText) : undefined,
              reviewCount: reviewCountText ? parseInt(reviewCountText.replace(/\D/g, '')) : undefined
            }));
          }
        } catch (itemError) {
          console.error(`[Trendyol] Ürün parse hatası:`, itemError);
          continue;
        }
      }
    } catch (error) {
      console.error(`[Trendyol] Liste parse hatası:`, error);
    }

    return products;
  }
}