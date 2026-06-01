
import { Command } from 'commander';
import { ShoppingService } from '../services/shopping-service';
import { SearchOptions } from '../types/shopping';

export function createShoppingCommand(): Command {
  const shoppingCommand = new Command('shopping')
    .alias('shop')
    .description('Alışveriş sitelerinde ürün ara')
    .argument('<query>', 'Aranacak ürün')
    .option('-s, --stores <stores>', 'Mağazalar (virgülle ayırın: trendyol,hepsiburada)')
    .option('--min-price <minPrice>', 'Minimum fiyat (TL)')
    .option('--max-price <maxPrice>', 'Maksimum fiyat (TL)')
    .option('--sort <sortBy>', 'Sıralama (price_asc, price_desc, relevance)', 'relevance')
    .option('-n, --max-results <maxResults>', 'Maksimum sonuç sayısı')
    .option('--json', 'JSON formatında çıktı ver')
    .action(async (query: string, options: any) => {
      try {
        const searchOptions: SearchOptions = {
          query,
          stores: options.stores ? options.stores.split(',').map((s: string) => s.trim().toLowerCase()) : undefined,
          minPrice: options.minPrice ? parseFloat(options.minPrice) : undefined,
          maxPrice: options.maxPrice ? parseFloat(options.maxPrice) : undefined,
          sortBy: options.sort as SearchOptions['sortBy'],
          maxResults: options.maxResults ? parseInt(options.maxResults, 10) : undefined
        };

        const shoppingService = new ShoppingService();
        const results = await shoppingService.search(searchOptions);
        
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          await shoppingService.displayResults(results);
        }
        
        await shoppingService.close();
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Bilinmeyen hata' }));
        } else {
          console.error('❌ Hata:', error instanceof Error ? error.message : 'Bilinmeyen hata');
        }
        process.exit(1);
      }
    });

  return shoppingCommand;
}