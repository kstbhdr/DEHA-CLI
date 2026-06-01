"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShoppingService = void 0;
var shopping_1 = require("../types/shopping");
var browser_manager_1 = require("./browser-manager");
var trendyol_parser_1 = require("./parsers/trendyol-parser");
var hepsiburada_parser_1 = require("./parsers/hepsiburada-parser");
var n11_parser_1 = require("./parsers/n11-parser");
var mediamarkt_parser_1 = require("./parsers/mediamarkt-parser");
var vatan_parser_1 = require("./parsers/vatan-parser");
var teknosa_parser_1 = require("./parsers/teknosa-parser");
var cimri_parser_1 = require("./parsers/cimri-parser");
var akakce_parser_1 = require("./parsers/akakce-parser");
var a101_parser_1 = require("./parsers/a101-parser");
var price_parser_1 = require("../utils/price-parser");
var ShoppingService = /** @class */ (function () {
    function ShoppingService() {
        this.browserManager = browser_manager_1.BrowserManager.getInstance();
        this.parsers = new Map();
        this.initializeParsers();
    }
    ShoppingService.prototype.initializeParsers = function () {
        var parserInstances = [
            new trendyol_parser_1.TrendyolParser(),
            new hepsiburada_parser_1.HepsiburadaParser(),
            new n11_parser_1.N11Parser(),
            new mediamarkt_parser_1.MediamarktParser(),
            new vatan_parser_1.VatanParser(),
            new teknosa_parser_1.TeknosaParser(),
            new cimri_parser_1.CimriParser(),
            new akakce_parser_1.AkakceParser(),
            new a101_parser_1.A101Parser()
        ];
        for (var _i = 0, parserInstances_1 = parserInstances; _i < parserInstances_1.length; _i++) {
            var parser = parserInstances_1[_i];
            this.parsers.set(parser['storeName'], parser);
        }
    };
    ShoppingService.prototype.search = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var query, stores, minPrice, maxPrice, sortBy, maxResults, activeStores, searchPromises, results, allProducts;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        query = options.query, stores = options.stores, minPrice = options.minPrice, maxPrice = options.maxPrice, sortBy = options.sortBy, maxResults = options.maxResults;
                        console.log("\n\uD83D\uDD0D \"".concat(query, "\" i\u00E7in al\u0131\u015Fveri\u015F aramas\u0131 ba\u015Flat\u0131l\u0131yor...\n"));
                        activeStores = stores
                            ? shopping_1.STORE_CONFIGS.filter(function (s) { return stores.includes(s.name) && s.enabled; })
                            : shopping_1.STORE_CONFIGS.filter(function (s) { return s.enabled; });
                        if (activeStores.length === 0) {
                            console.log('❌ Aktif mağaza bulunamadı.');
                            return [2 /*return*/, []];
                        }
                        console.log("\uD83D\uDCE6 ".concat(activeStores.length, " ma\u011Fazada aran\u0131yor: ").concat(activeStores.map(function (s) { return s.name; }).join(', '), "\n"));
                        searchPromises = activeStores.map(function (store) { return __awaiter(_this, void 0, void 0, function () {
                            var parser, products, error_1;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        parser = this.parsers.get(store.name);
                                        if (!parser) {
                                            console.warn("\u26A0\uFE0F ".concat(store.name, " i\u00E7in parser bulunamad\u0131"));
                                            return [2 /*return*/, []];
                                        }
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, parser.search(query)];
                                    case 2:
                                        products = _a.sent();
                                        return [2 /*return*/, products];
                                    case 3:
                                        error_1 = _a.sent();
                                        console.error("\u274C ".concat(store.name, " hatas\u0131:"), error_1 instanceof Error ? error_1.message : 'Bilinmeyen hata');
                                        return [2 /*return*/, []];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); });
                        return [4 /*yield*/, Promise.all(searchPromises)];
                    case 1:
                        results = _a.sent();
                        allProducts = results.flat();
                        // Filtreleme
                        if (minPrice !== undefined) {
                            allProducts = allProducts.filter(function (p) { return p.price >= minPrice * 100; });
                        }
                        if (maxPrice !== undefined) {
                            allProducts = allProducts.filter(function (p) { return p.price <= maxPrice * 100; });
                        }
                        // Sıralama
                        if (sortBy) {
                            switch (sortBy) {
                                case 'price_asc':
                                    allProducts.sort(function (a, b) { return a.price - b.price; });
                                    break;
                                case 'price_desc':
                                    allProducts.sort(function (a, b) { return b.price - a.price; });
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
                        return [2 /*return*/, allProducts];
                }
            });
        });
    };
    ShoppingService.prototype.displayResults = function (products) {
        return __awaiter(this, void 0, void 0, function () {
            var grouped, _i, products_1, product, storeProducts, _a, grouped_1, _b, store, storeProducts, prices, minPrice, maxPrice, avgPrice;
            return __generator(this, function (_c) {
                if (products.length === 0) {
                    console.log('\n❌ Hiç ürün bulunamadı.');
                    return [2 /*return*/];
                }
                console.log("\n".concat('='.repeat(80)));
                console.log("\uD83D\uDCCA Toplam ".concat(products.length, " \u00FCr\u00FCn bulundu"));
                console.log("".concat('='.repeat(80), "\n"));
                grouped = new Map();
                for (_i = 0, products_1 = products; _i < products_1.length; _i++) {
                    product = products_1[_i];
                    storeProducts = grouped.get(product.store) || [];
                    storeProducts.push(product);
                    grouped.set(product.store, storeProducts);
                }
                for (_a = 0, grouped_1 = grouped; _a < grouped_1.length; _a++) {
                    _b = grouped_1[_a], store = _b[0], storeProducts = _b[1];
                    console.log("\uD83C\uDFEA ".concat(store.toUpperCase(), " (").concat(storeProducts.length, " \u00FCr\u00FCn)"));
                    console.log('-'.repeat(60));
                    storeProducts.forEach(function (product, index) {
                        var priceFormatted = (0, price_parser_1.formatTurkishPrice)(product.price);
                        console.log("  ".concat(index + 1, ". ").concat(product.name));
                        console.log("     \uD83D\uDCB0 ".concat(priceFormatted));
                        if (product.rating) {
                            console.log("     \u2B50 ".concat(product.rating.toFixed(1)).concat(product.reviewCount ? " (".concat(product.reviewCount, " yorum)") : ''));
                        }
                        console.log("     \uD83D\uDD17 ".concat(product.url));
                        console.log();
                    });
                }
                // İstatistikler
                console.log('-'.repeat(60));
                prices = products.map(function (p) { return p.price; });
                minPrice = Math.min.apply(Math, prices);
                maxPrice = Math.max.apply(Math, prices);
                avgPrice = Math.round(prices.reduce(function (a, b) { return a + b; }, 0) / prices.length);
                console.log("\uD83D\uDCC8 \u0130statistikler:");
                console.log("   En d\u00FC\u015F\u00FCk: ".concat((0, price_parser_1.formatTurkishPrice)(minPrice)));
                console.log("   En y\u00FCksek: ".concat((0, price_parser_1.formatTurkishPrice)(maxPrice)));
                console.log("   Ortalama: ".concat((0, price_parser_1.formatTurkishPrice)(avgPrice)));
                console.log("".concat('='.repeat(80), "\n"));
                return [2 /*return*/];
            });
        });
    };
    ShoppingService.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.browserManager.close()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return ShoppingService;
}());
exports.ShoppingService = ShoppingService;
