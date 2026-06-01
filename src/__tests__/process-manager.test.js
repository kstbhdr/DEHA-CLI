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
var vitest_1 = require("vitest");
// child_process mock
var mockExecSync = vitest_1.vi.hoisted(function () { return vitest_1.vi.fn(); });
var mockSpawn = vitest_1.vi.hoisted(function () { return vitest_1.vi.fn(function () { return ({ on: vitest_1.vi.fn(), kill: vitest_1.vi.fn() }); }); });
vitest_1.vi.mock('child_process', function () { return ({
    execSync: mockExecSync,
    spawn: mockSpawn,
}); });
// net mock — createConnection direkt vi.fn() ile
var mockCreateConnection = vitest_1.vi.hoisted(function () { return vitest_1.vi.fn(); });
vitest_1.vi.mock('net', function () { return ({
    createConnection: mockCreateConnection,
}); });
// fs mock
vitest_1.vi.mock('fs', function () { return ({
    existsSync: vitest_1.vi.fn(),
    mkdirSync: vitest_1.vi.fn(),
    writeFileSync: vitest_1.vi.fn(),
}); });
// redis-memory-server mock
vitest_1.vi.mock('redis-memory-server', function () { return ({
    RedisMemoryServer: vitest_1.vi.fn().mockImplementation(function () { return ({
        start: vitest_1.vi.fn().mockResolvedValue(undefined),
        stop: vitest_1.vi.fn().mockResolvedValue(undefined),
    }); }),
}); });
var process_manager_1 = require("../services/process-manager");
function makeSocket(events) {
    var sock = { destroy: vitest_1.vi.fn(), setTimeout: vitest_1.vi.fn(), on: vitest_1.vi.fn() };
    sock.on.mockImplementation(function (evt, cb) {
        if (events[evt])
            setTimeout(function () { return events[evt](cb); }, 5);
        return sock;
    });
    return sock;
}
function mockPortOpen(isOpen) {
    mockCreateConnection.mockImplementation(function (opts) {
        if (isOpen) {
            return makeSocket({ connect: function (cb) { return cb(); } });
        }
        return makeSocket({
            error: function (cb) { return cb(new Error('refused')); },
            timeout: function (cb) { return cb(); },
        });
    });
}
(0, vitest_1.describe)('process-manager', function () {
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)('ensureRedis', function () {
        (0, vitest_1.it)('port aciksa running doner', function () { return __awaiter(void 0, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mockPortOpen(true);
                        return [4 /*yield*/, (0, process_manager_1.ensureRedis)()];
                    case 1:
                        result = _a.sent();
                        (0, vitest_1.expect)(result).toBe('running');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('port kapali ve redis-server yoksa unavailable doner', function () { return __awaiter(void 0, void 0, void 0, function () {
            var RedisMemoryServer, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mockPortOpen(false);
                        mockExecSync.mockImplementation(function () { throw new Error('not found'); });
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('redis-memory-server'); })];
                    case 1:
                        RedisMemoryServer = (_a.sent()).RedisMemoryServer;
                        RedisMemoryServer.mockImplementationOnce(function () { return ({
                            start: vitest_1.vi.fn().mockRejectedValue(new Error('install failed')),
                        }); });
                        return [4 /*yield*/, (0, process_manager_1.ensureRedis)()];
                    case 2:
                        result = _a.sent();
                        (0, vitest_1.expect)(result).toBe('unavailable');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('redis-server binary ile baslatilabilir', function () { return __awaiter(void 0, void 0, void 0, function () {
            var callCount, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mockPortOpen(false);
                        callCount = 0;
                        mockCreateConnection.mockImplementation(function (opts) {
                            callCount++;
                            var isConnected = callCount >= 3; // ilk 2 deneme (IPv4+IPv6) basarisiz
                            if (isConnected) {
                                return makeSocket({ connect: function (cb) { return cb(); } });
                            }
                            return makeSocket({
                                error: function (cb) { return cb(new Error('refused')); },
                                timeout: function (cb) { return cb(); },
                            });
                        });
                        // redis-server exists
                        mockExecSync.mockImplementation(function (cmd) {
                            if (cmd.includes('which') || cmd.includes('where'))
                                return '/usr/bin/redis-server\n';
                            throw new Error('not found');
                        });
                        return [4 /*yield*/, (0, process_manager_1.ensureRedis)()];
                    case 1:
                        result = _a.sent();
                        (0, vitest_1.expect)(result).toBe('started');
                        (0, vitest_1.expect)(mockSpawn).toHaveBeenCalledWith('redis-server', vitest_1.expect.any(Array), vitest_1.expect.any(Object));
                        return [2 /*return*/];
                }
            });
        }); });
    });
    (0, vitest_1.describe)('ensureChroma', function () {
        (0, vitest_1.it)('port aciksa running doner', function () { return __awaiter(void 0, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mockPortOpen(true);
                        return [4 /*yield*/, (0, process_manager_1.ensureChroma)()];
                    case 1:
                        result = _a.sent();
                        (0, vitest_1.expect)(result).toBe('running');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, vitest_1.it)('Python yoksa unavailable doner', function () { return __awaiter(void 0, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mockPortOpen(false);
                        mockExecSync.mockImplementation(function () { throw new Error('not found'); });
                        return [4 /*yield*/, (0, process_manager_1.ensureChroma)()];
                    case 1:
                        result = _a.sent();
                        (0, vitest_1.expect)(result).toBe('unavailable');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    (0, vitest_1.describe)('startServices', function () {
        (0, vitest_1.it)('her iki servis running doner', function () { return __awaiter(void 0, void 0, void 0, function () {
            var status;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        mockPortOpen(true);
                        return [4 /*yield*/, (0, process_manager_1.startServices)()];
                    case 1:
                        status = _a.sent();
                        (0, vitest_1.expect)(status.redis).toBe('running');
                        (0, vitest_1.expect)(status.chromadb).toBe('running');
                        return [2 /*return*/];
                }
            });
        }); });
    });
    (0, vitest_1.describe)('stopServices', function () {
        (0, vitest_1.it)('hata firlatmaz', function () {
            (0, vitest_1.expect)(function () { return (0, process_manager_1.stopServices)(); }).not.toThrow();
        });
    });
});
