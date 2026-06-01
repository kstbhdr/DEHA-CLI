"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.mcpManager = void 0;
var index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
var stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
var sse_js_1 = require("@modelcontextprotocol/sdk/client/sse.js");
var chalk_1 = require("chalk");
var config_1 = require("./config");
var version_1 = require("../version");
var McpManager = /** @class */ (function () {
    function McpManager() {
        this.servers = [];
        this.connected = false;
    }
    /** Tüm konfigüre edilmiş sunuculara bağlanır */
    McpManager.prototype.connectAll = function () {
        return __awaiter(this, arguments, void 0, function (silent) {
            var config, names, results, ok, fail;
            var _this = this;
            if (silent === void 0) { silent = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = (0, config_1.readMcpConfig)();
                        names = Object.keys(config.servers);
                        if (names.length === 0)
                            return [2 /*return*/];
                        if (!silent)
                            process.stdout.write(chalk_1.default.dim("MCP: ".concat(names.length, " sunucu ba\u011Flan\u0131yor...")));
                        return [4 /*yield*/, Promise.allSettled(names.map(function (name) { return _this.connectServer(name, config.servers[name]); }))];
                    case 1:
                        results = _a.sent();
                        ok = results.filter(function (r) { return r.status === 'fulfilled'; }).length;
                        fail = results.filter(function (r) { return r.status === 'rejected'; }).length;
                        if (!silent) {
                            process.stdout.write(chalk_1.default.green(" \u2713 ".concat(ok)) +
                                (fail > 0 ? chalk_1.default.red(" \u2717 ".concat(fail)) : '') +
                                '\n');
                        }
                        this.connected = true;
                        return [2 /*return*/];
                }
            });
        });
    };
    McpManager.prototype.connectServer = function (name, cfg) {
        return __awaiter(this, void 0, void 0, function () {
            var client, transport, tools;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        client = new index_js_1.Client({ name: "deha-".concat(name), version: version_1.DEHA_SEMVER });
                        if (cfg.transport === 'sse' && cfg.url) {
                            transport = new sse_js_1.SSEClientTransport(new URL(cfg.url));
                        }
                        else {
                            transport = new stdio_js_1.StdioClientTransport({
                                command: cfg.command,
                                args: (_a = cfg.args) !== null && _a !== void 0 ? _a : [],
                                env: __assign(__assign({}, process.env), ((_b = cfg.env) !== null && _b !== void 0 ? _b : {})),
                            });
                        }
                        return [4 /*yield*/, client.connect(transport)];
                    case 1:
                        _c.sent();
                        return [4 /*yield*/, client.listTools()];
                    case 2:
                        tools = (_c.sent()).tools;
                        this.servers.push({ name: name, client: client, tools: tools });
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Tüm sunucuların toollarını Anthropic formatında döner */
    McpManager.prototype.getAnthropicTools = function () {
        var _a, _b;
        var tools = [];
        for (var _i = 0, _c = this.servers; _i < _c.length; _i++) {
            var server = _c[_i];
            for (var _d = 0, _e = server.tools; _d < _e.length; _d++) {
                var tool = _e[_d];
                tools.push({
                    name: "mcp__".concat(server.name, "__").concat(tool.name),
                    description: "[MCP:".concat(server.name, "] ").concat((_a = tool.description) !== null && _a !== void 0 ? _a : tool.name),
                    input_schema: (_b = tool.inputSchema) !== null && _b !== void 0 ? _b : {
                        type: 'object',
                        properties: {},
                    },
                });
            }
        }
        return tools;
    };
    /** MCP tool çağrısı — tool adından server ve tool ismini çıkarır */
    McpManager.prototype.callTool = function (fullName, input) {
        return __awaiter(this, void 0, void 0, function () {
            var parts, serverName, toolName, server, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        parts = fullName.split('__');
                        if (parts.length < 3 || parts[0] !== 'mcp') {
                            throw new Error("Ge\u00E7ersiz MCP tool ad\u0131: ".concat(fullName));
                        }
                        serverName = parts[1];
                        toolName = parts.slice(2).join('__');
                        server = this.servers.find(function (s) { return s.name === serverName; });
                        if (!server)
                            throw new Error("MCP sunucusu bulunamad\u0131: ".concat(serverName));
                        return [4 /*yield*/, server.client.callTool({ name: toolName, arguments: input })];
                    case 1:
                        result = _a.sent();
                        // Sonucu string'e çevir
                        if (typeof result.content === 'string')
                            return [2 /*return*/, result.content];
                        if (Array.isArray(result.content)) {
                            return [2 /*return*/, result.content
                                    .map(function (block) { var _a; return block.type === 'text' ? ((_a = block.text) !== null && _a !== void 0 ? _a : '') : JSON.stringify(block); })
                                    .join('\n')];
                        }
                        return [2 /*return*/, JSON.stringify(result.content)];
                }
            });
        });
    };
    McpManager.prototype.isMcpTool = function (name) {
        return name.startsWith('mcp__');
    };
    McpManager.prototype.getServerList = function () {
        return this.servers.map(function (s) { return ({
            name: s.name,
            toolCount: s.tools.length,
            tools: s.tools.map(function (t) { return t.name; }),
        }); });
    };
    McpManager.prototype.disconnectAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.allSettled(this.servers.map(function (s) { return s.client.close(); }))];
                    case 1:
                        _a.sent();
                        this.servers = [];
                        this.connected = false;
                        return [2 /*return*/];
                }
            });
        });
    };
    McpManager.prototype.isConnected = function () {
        return this.connected;
    };
    return McpManager;
}());
// Singleton
exports.mcpManager = new McpManager();
