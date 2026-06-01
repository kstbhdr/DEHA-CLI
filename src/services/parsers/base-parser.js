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
exports.BaseParser = void 0;
var price_parser_1 = require("../../utils/price-parser");
var browser_manager_1 = require("../browser-manager");
var BaseParser = /** @class */ (function () {
    function BaseParser() {
        this.browserManager = browser_manager_1.BrowserManager.getInstance();
    }
    BaseParser.prototype.search = function (query) {
        return __awaiter(this, void 0, void 0, function () {
            var page, searchUrl, products, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.browserManager.getPage()];
                    case 1:
                        page = _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 8, 9, 11]);
                        return [4 /*yield*/, this.browserManager.waitForRateLimit(this.storeName)];
                    case 3:
                        _a.sent();
                        searchUrl = this.getSearchUrl(query);
                        console.log("[".concat(this.storeName, "] Aran\u0131yor: ").concat(searchUrl));
                        return [4 /*yield*/, page.goto(searchUrl, {
                                waitUntil: 'networkidle',
                                timeout: 30000
                            })];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.browserManager.randomDelay(500, 1500)];
                    case 5:
                        _a.sent();
                        // Rastgele scroll yap (bot tespitini önle)
                        return [4 /*yield*/, this.randomScroll(page)];
                    case 6:
                        // Rastgele scroll yap (bot tespitini önle)
                        _a.sent();
                        return [4 /*yield*/, this.parseProductList(page)];
                    case 7:
                        products = _a.sent();
                        console.log("[".concat(this.storeName, "] ").concat(products.length, " \u00FCr\u00FCn bulundu"));
                        return [2 /*return*/, products];
                    case 8:
                        error_1 = _a.sent();
                        console.error("[".concat(this.storeName, "] Hata:"), error_1 instanceof Error ? error_1.message : 'Bilinmeyen hata');
                        return [2 /*return*/, []];
                    case 9: return [4 /*yield*/, page.close()];
                    case 10:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    BaseParser.prototype.randomScroll = function (page) {
        return __awaiter(this, void 0, void 0, function () {
            var scrollHeight, scrolls, i, scrollPosition;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, page.evaluate(function () { return document.body.scrollHeight; })];
                    case 1:
                        scrollHeight = _a.sent();
                        scrolls = Math.floor(Math.random() * 3) + 1;
                        i = 0;
                        _a.label = 2;
                    case 2:
                        if (!(i < scrolls)) return [3 /*break*/, 6];
                        scrollPosition = Math.floor(Math.random() * scrollHeight * 0.7);
                        return [4 /*yield*/, page.evaluate(function (pos) { return window.scrollTo(0, pos); }, scrollPosition)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.browserManager.randomDelay(200, 800)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        i++;
                        return [3 /*break*/, 2];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    BaseParser.prototype.parsePrice = function (priceText) {
        return (0, price_parser_1.parseTurkishPrice)(priceText);
    };
    BaseParser.prototype.createProduct = function (data) {
        var _a;
        return {
            name: data.name.trim(),
            price: this.parsePrice(data.priceText),
            priceText: data.priceText.trim(),
            currency: 'TL',
            store: this.storeName,
            url: data.url.startsWith('http') ? data.url : "".concat(this.baseUrl).concat(data.url),
            imageUrl: data.imageUrl,
            rating: data.rating,
            reviewCount: data.reviewCount,
            inStock: (_a = data.inStock) !== null && _a !== void 0 ? _a : true,
            shipping: data.shipping,
            category: data.category
        };
    };
    return BaseParser;
}());
exports.BaseParser = BaseParser;
