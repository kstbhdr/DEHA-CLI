
export interface Product {
  name: string;
  price: number;        // Kuruş cinsinden
  priceText: string;    // Orijinal fiyat metni
  currency: string;     // "TL"
  store: string;        // Site adı
  url: string;
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  inStock: boolean;
  shipping?: string;
  category?: string;
}

export interface SearchOptions {
  query: string;
  minPrice?: number;
  maxPrice?: number;
  stores?: string[];
  sortBy?: 'price_asc' | 'price_desc' | 'relevance';
  maxResults?: number;
}

export interface StoreConfig {
  name: string;
  baseUrl: string;
  searchPath: string;
  enabled: boolean;
  rateLimitMs: number;
}

export const STORE_CONFIGS: StoreConfig[] = [
  { name: 'trendyol', baseUrl: 'https://www.trendyol.com', searchPath: '/sr?q=', enabled: true, rateLimitMs: 2000 },
  { name: 'hepsiburada', baseUrl: 'https://www.hepsiburada.com', searchPath: '/ara?q=', enabled: true, rateLimitMs: 2000 },
  { name: 'n11', baseUrl: 'https://www.n11.com', searchPath: '/ara?q=', enabled: true, rateLimitMs: 2000 },
  { name: 'mediamarkt', baseUrl: 'https://www.mediamarkt.com.tr', searchPath: '/search?query=', enabled: true, rateLimitMs: 2000 },
  { name: 'vatan', baseUrl: 'https://www.vatanbilgisayar.com', searchPath: '/search?q=', enabled: true, rateLimitMs: 2000 },
  { name: 'teknosa', baseUrl: 'https://www.teknosa.com', searchPath: '/search?q=', enabled: true, rateLimitMs: 2000 },
  { name: 'cimri', baseUrl: 'https://www.cimri.com', searchPath: '/arama?q=', enabled: true, rateLimitMs: 2000 },
  { name: 'akakce', baseUrl: 'https://www.akakce.com', searchPath: '/arama/?q=', enabled: true, rateLimitMs: 2000 },
  { name: 'a101', baseUrl: 'https://www.a101.com.tr', searchPath: '/arama?q=', enabled: true, rateLimitMs: 2000 },
];