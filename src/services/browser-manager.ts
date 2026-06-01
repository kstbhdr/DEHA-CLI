import { Browser, BrowserContext, Page, chromium } from 'playwright';

interface BrowserManagerConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  proxy?: string;
}

const DEFAULT_CONFIG: BrowserManagerConfig = {
  headless: true,
  viewport: { width: 1920, height: 1080 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: BrowserManagerConfig;
  private lastRequestTime: Map<string, number> = new Map();

  private constructor(config: BrowserManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: BrowserManagerConfig): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager(config);
    }
    return BrowserManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      geolocation: { latitude: 41.0082, longitude: 28.9784 },
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      }
    });

    // Stealth-like önlemler
    await this.context.addInitScript(() => {
      // @ts-ignore
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // @ts-ignore
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // @ts-ignore
      Object.defineProperty(navigator, 'languages', {
        get: () => ['tr-TR', 'tr', 'en-US', 'en'],
      });

      // Canvas fingerprint'ı gizle
      // @ts-ignore
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      // @ts-ignore
      HTMLCanvasElement.prototype.getContext = function(type: string, ...args: any[]) {
        // @ts-ignore
        const context = originalGetContext.apply(this, [type, ...args]);
        if (type === '2d') {
          // @ts-ignore
          const originalGetImageData = context!.getImageData;
          // @ts-ignore
          context!.getImageData = function(...args: any[]) {
            // @ts-ignore
            const imageData = originalGetImageData.apply(this, args);
            // Rastgele gürültü ekle
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] = imageData.data[i] + Math.floor(Math.random() * 2);
              imageData.data[i + 1] = imageData.data[i + 1] + Math.floor(Math.random() * 2);
              imageData.data[i + 2] = imageData.data[i + 2] + Math.floor(Math.random() * 2);
            }
            return imageData;
          };
        }
        return context;
      };
    });
  }

  async getPage(): Promise<Page> {
    if (!this.context) {
      await this.initialize();
    }
    return this.context!.newPage();
  }

  async waitForRateLimit(storeName: string): Promise<void> {
    const now = Date.now();
    const lastRequest = this.lastRequestTime.get(storeName) || 0;
    const minInterval = 2000; // 2 saniye
    const waitTime = Math.max(0, minInterval - (now - lastRequest));
    
    if (waitTime > 0) {
      await this.sleep(waitTime + Math.random() * 1000); // Rastgele gecikme
    }
    
    this.lastRequestTime.set(storeName, Date.now());
  }

  async randomDelay(min: number = 100, max: number = 500): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.sleep(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }
}