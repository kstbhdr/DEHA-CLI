"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.CimriParser = void 0;
var base_parser_1 = require("./base-parser");
var CimriParser = /** @class */ (function (_super) {
    __extends(CimriParser, _super);
    function CimriParser() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.storeName = 'cimri';
        _this.baseUrl = 'https://www.cimri.com';
        _this.searchPath = '/arama?q=';
        return _this;
    }
    CimriParser.prototype.getSearchUrl = function (query) {
        return "".concat(this.baseUrl).concat(this.searchPath).concat(encodeURIComponent(query));
    };
    CimriParser.prototype.parseProductList = function (page) {
        return __awaiter(this, void 0, void 0, function () {
            var products, items, _i, items_1, item, name_1, priceText, url, imageUrl, itemError_1, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        products = [];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 13, , 14]);
                        return [4 /*yield*/, page.waitForSelector('[class*="product-card"], [class*="product"]', { timeout: 10000 })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, page.$$('[class*="product-card"], [class*="product"]')];
                    case 3:
                        items = _a.sent();
                        _i = 0, items_1 = items;
                        _a.label = 4;
                    case 4:
                        if (!(_i < items_1.length)) return [3 /*break*/, 12];
                        item = items_1[_i];
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 10, , 11]);
                        return [4 /*yield*/, item.$eval('[class*="product-name"], [class*="title"]', function (el) { var _a; return ((_a = el.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || ''; })];
                    case 6:
                        name_1 = _a.sent();
                        return [4 /*yield*/, item.$eval('[class*="price"], [class*="current-price"]', function (el) { var _a; return ((_a = el.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || ''; })];
                    case 7:
                        priceText = _a.sent();
                        return [4 /*yield*/, item.$eval('a', function (el) { return el.getAttribute('href') || ''; })];
                    case 8:
                        url = _a.sent();
                        return [4 /*yield*/, item.$eval('img', function (el) { return el.getAttribute('src') || ''; })];
                    case 9:
                        imageUrl = _a.sent();
                        if (name_1 && priceText) {
                            products.push(this.createProduct({
                                name: name_1,
                                priceText: priceText,
                                url: url,
                                imageUrl: (imageUrl === null || imageUrl === void 0 ? void 0 : imageUrl.startsWith('//')) ? "https:".concat(imageUrl) : imageUrl
                            }));
                        }
                        return [3 /*break*/, 11];
                    case 10:
                        itemError_1 = _a.sent();
                        console.error("[Cimri] \u00DCr\u00FCn parse hatas\u0131:", itemError_1);
                        return [3 /*break*/, 11];
                    case 11:
                        _i++;
                        return [3 /*break*/, 4];
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        error_1 = _a.sent();
                        console.error("[Cimri] Liste parse hatas\u0131:", error_1);
                        return [3 /*break*/, 14];
                    case 14: return [2 /*return*/, products];
                }
            });
        });
    };
    return CimriParser;
}(base_parser_1.BaseParser));
exports.CimriParser = CimriParser;
