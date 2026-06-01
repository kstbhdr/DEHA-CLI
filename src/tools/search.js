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
exports.duckDuckGoSearch = duckDuckGoSearch;
exports.toolWebSearch = toolWebSearch;
exports.toolCrawlUrl = toolCrawlUrl;
var https = require("https");
var cheerio = require("cheerio");
// ─── DuckDuckGo Search ───────────────────────────────────────────────────────
/** DuckDuckGo Lite search via native https (axios triggers bot detection) */
function ddgLiteFetch(query) {
    return __awaiter(this, void 0, void 0, function () {
        var endpoints, _loop_1, _i, endpoints_1, ep, state_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    endpoints = [
                        { hostname: 'lite.duckduckgo.com', path: '/lite/', method: 'POST', makeBody: function (q) { return "q=".concat(encodeURIComponent(q), "&kl=wt-wt"); } },
                        { hostname: 'html.duckduckgo.com', path: '/html/', method: 'POST', makeBody: function (q) { return "q=".concat(encodeURIComponent(q)); } },
                    ];
                    _loop_1 = function (ep) {
                        var result, _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    _c.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                                            var body = ep.makeBody(query);
                                            var options = {
                                                hostname: ep.hostname,
                                                path: ep.path,
                                                method: ep.method,
                                                headers: {
                                                    'Content-Type': 'application/x-www-form-urlencoded',
                                                    'Content-Length': Buffer.byteLength(body),
                                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                                    'Accept': 'text/html,application/xhtml+xml',
                                                    'Accept-Language': 'en-US,en;q=0.9',
                                                    'Referer': "https://".concat(ep.hostname, "/"),
                                                    'Origin': "https://".concat(ep.hostname),
                                                },
                                            };
                                            var req = https.request(options, function (res) {
                                                var data = '';
                                                res.on('data', function (chunk) { data += chunk.toString(); });
                                                res.on('end', function () {
                                                    if (res.statusCode !== 200)
                                                        reject(new Error("".concat(ep.hostname, " returned ").concat(res.statusCode)));
                                                    else
                                                        resolve(data);
                                                });
                                            });
                                            req.setTimeout(15000, function () { req.destroy(); reject(new Error("".concat(ep.hostname, " timeout"))); });
                                            req.on('error', reject);
                                            req.write(body);
                                            req.end();
                                        })];
                                case 1:
                                    result = _c.sent();
                                    return [2 /*return*/, { value: result }];
                                case 2:
                                    _b = _c.sent();
                                    return [2 /*return*/, "continue"];
                                case 3: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, endpoints_1 = endpoints;
                    _a.label = 1;
                case 1:
                    if (!(_i < endpoints_1.length)) return [3 /*break*/, 4];
                    ep = endpoints_1[_i];
                    return [5 /*yield**/, _loop_1(ep)];
                case 2:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: throw new Error('All DuckDuckGo endpoints failed');
            }
        });
    });
}
function duckDuckGoSearch(query_1) {
    return __awaiter(this, arguments, void 0, function (query, maxResults) {
        var html, $, results;
        if (maxResults === void 0) { maxResults = 8; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ddgLiteFetch(query)];
                case 1:
                    html = _a.sent();
                    $ = cheerio.load(html);
                    results = [];
                    // DDG Lite structure: result links are plain <a href="https://..."> tags
                    // Snippet is in the next <tr>'s last <td>
                    $('a').each(function (_, el) {
                        var _a;
                        if (results.length >= maxResults)
                            return false;
                        var href = (_a = $(el).attr('href')) !== null && _a !== void 0 ? _a : '';
                        if (!href.startsWith('http') || href.includes('duckduckgo.com'))
                            return;
                        var title = $(el).text().trim();
                        var row = $(el).closest('tr');
                        var nextRow = row.next('tr');
                        var snippet = nextRow.find('td').last().text().trim();
                        if (title && href)
                            results.push({ title: title, url: href, snippet: snippet });
                    });
                    return [2 /*return*/, results];
            }
        });
    });
}
// ─── Tool entrypoints ────────────────────────────────────────────────────────
function toolWebSearch(input) {
    return __awaiter(this, void 0, void 0, function () {
        var query, _a, max_results, results;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    query = input.query, _a = input.max_results, max_results = _a === void 0 ? 8 : _a;
                    return [4 /*yield*/, duckDuckGoSearch(query, max_results)];
                case 1:
                    results = _b.sent();
                    return [2 /*return*/, formatResults('DuckDuckGo', results) || 'No results found.'];
            }
        });
    });
}
function toolCrawlUrl(input) {
    return __awaiter(this, void 0, void 0, function () {
        var url, _a, max_chars, html, $, selectors, text, _i, selectors_1, sel, el;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    url = input.url, _a = input.max_chars, max_chars = _a === void 0 ? 4000 : _a;
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var parsed = new URL(url);
                            var options = {
                                hostname: parsed.hostname,
                                path: parsed.pathname + parsed.search,
                                method: 'GET',
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                    'Accept': 'text/html,application/xhtml+xml',
                                    'Accept-Language': 'en-US,en;q=0.9',
                                },
                            };
                            var req = https.request(options, function (res) {
                                // Follow redirects (up to 3)
                                if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                                    try {
                                        var redirectUrl = new URL(res.headers.location, url).toString();
                                        toolCrawlUrl({ url: redirectUrl, max_chars: max_chars }).then(resolve).catch(reject);
                                    }
                                    catch (_a) {
                                        reject(new Error("Redirect hatas\u0131: ".concat(res.headers.location)));
                                    }
                                    return;
                                }
                                if (res.statusCode !== 200) {
                                    reject(new Error("HTTP ".concat(res.statusCode)));
                                    return;
                                }
                                var data = '';
                                res.on('data', function (chunk) { data += chunk.toString(); });
                                res.on('end', function () { return resolve(data); });
                            });
                            req.setTimeout(15000, function () { req.destroy(); reject(new Error('Timeout')); });
                            req.on('error', reject);
                            req.end();
                        })];
                case 1:
                    html = _b.sent();
                    $ = cheerio.load(html);
                    // Remove non-content elements
                    $('script, style, nav, header, footer, iframe, noscript, meta, link').remove();
                    selectors = ['article', 'main', '[role="main"]', '.content', '#content', '.markdown-body', '.post-content', '.entry-content', 'body'];
                    text = '';
                    for (_i = 0, selectors_1 = selectors; _i < selectors_1.length; _i++) {
                        sel = selectors_1[_i];
                        el = $(sel);
                        if (el.length > 0 && el.text().trim().length > 100) {
                            text = el.text();
                            break;
                        }
                    }
                    if (!text)
                        text = $('body').text();
                    // Clean up whitespace
                    text = text
                        .replace(/\s+/g, ' ')
                        .trim();
                    if (text.length > max_chars) {
                        text = text.slice(0, max_chars) + '…';
                    }
                    return [2 /*return*/, text || 'Sayfa içeriği alınamadı.'];
            }
        });
    });
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatResults(source, results) {
    if (!results.length)
        return "**".concat(source, "**: No results found.");
    var lines = results.map(function (r, i) {
        return "".concat(i + 1, ". **").concat(r.title, "**\n   URL: ").concat(r.url, "\n   ").concat(r.snippet);
    });
    return "**".concat(source, " Results:**\n\n").concat(lines.join('\n\n'));
}
