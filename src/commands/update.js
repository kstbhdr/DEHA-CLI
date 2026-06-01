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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkForUpdates = checkForUpdates;
exports.runUpdate = runUpdate;
var child_process_1 = require("child_process");
var axios_1 = require("axios");
var chalk_1 = require("chalk");
var version_1 = require("../version");
var logger_1 = require("../services/logger");
var CURRENT_VERSION = version_1.DEHA_SEMVER;
var NPM_PACKAGE = 'deha-cli';
var GITHUB_REPO = (_a = process.env.DEHA_GITHUB_REPO) !== null && _a !== void 0 ? _a : 'kstbhdr/DEHA-CLI';
function checkForUpdates() {
    return __awaiter(this, arguments, void 0, function (silent) {
        var info, _a;
        if (silent === void 0) { silent = false; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fetchLatestVersion()];
                case 1:
                    info = _b.sent();
                    if (!info)
                        return [2 /*return*/];
                    if (isNewer(info.latest, CURRENT_VERSION)) {
                        logger_1.logger.write('\n' + chalk_1.default.bgYellow.black(' GÜNCELLEME MEVCUT ') +
                            chalk_1.default.yellow(" v".concat(version_1.DEHA_VERSION, " \u2192 v").concat(info.latest)) +
                            chalk_1.default.dim(" (".concat(info.source, ")")));
                        logger_1.logger.write(chalk_1.default.dim('  deha update  →  güncellemek için\n'));
                    }
                    else if (!silent) {
                        logger_1.logger.write(chalk_1.default.green("\n\u2713 En g\u00FCncel s\u00FCr\u00FCm\u00FC kullan\u0131yorsun (v".concat(version_1.DEHA_VERSION, ")\n")));
                    }
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    if (!silent)
                        logger_1.logger.write(chalk_1.default.dim('\nGüncelleme kontrolü başarısız.\n'));
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function runUpdate() {
    return __awaiter(this, void 0, void 0, function () {
        var info, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('═══ DEHA Güncelleme ═══'));
                    logger_1.logger.write(chalk_1.default.dim("  Mevcut s\u00FCr\u00FCm: v".concat(version_1.DEHA_VERSION, "\n")));
                    process.stdout.write(chalk_1.default.dim('  Son sürüm kontrol ediliyor... '));
                    info = null;
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetchLatestVersion()];
                case 2:
                    info = _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    logger_1.logger.write(chalk_1.default.red('✗ Bağlantı hatası'));
                    return [3 /*break*/, 4];
                case 4:
                    if (!info) {
                        logger_1.logger.write(chalk_1.default.red('\n  Sürüm bilgisi alınamadı.\n'));
                        printManualUpdate();
                        return [2 /*return*/];
                    }
                    logger_1.logger.write(chalk_1.default.green("v".concat(info.latest)) + chalk_1.default.dim(" (".concat(info.source, ")")));
                    if (!isNewer(info.latest, CURRENT_VERSION)) {
                        logger_1.logger.write(chalk_1.default.green('\n  ✓ Zaten en güncel sürümdesin!\n'));
                        return [2 /*return*/];
                    }
                    logger_1.logger.write(chalk_1.default.yellow("\n  Yeni s\u00FCr\u00FCm bulundu: v".concat(version_1.DEHA_VERSION, " \u2192 v").concat(info.latest)));
                    logger_1.logger.write(chalk_1.default.dim('  Güncelleniyor...\n'));
                    // npm ile kurulduysa npm üzerinden güncelle
                    if (isGlobalNpmInstall()) {
                        runNpmUpdate();
                    }
                    else if (GITHUB_REPO) {
                        runGitUpdate();
                    }
                    else {
                        printManualUpdate();
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// ─── Sürüm kontrolü ─────────────────────────────────────────────────────────
function fetchLatestVersion() {
    return __awaiter(this, void 0, void 0, function () {
        var res, _a, res, tag, version, _b;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, axios_1.default.get("https://registry.npmjs.org/".concat(NPM_PACKAGE, "/latest"), {
                            timeout: 5000,
                        })];
                case 1:
                    res = _d.sent();
                    return [2 /*return*/, { latest: res.data.version, source: 'npm' }];
                case 2:
                    _a = _d.sent();
                    return [3 /*break*/, 3];
                case 3:
                    if (!GITHUB_REPO) return [3 /*break*/, 7];
                    _d.label = 4;
                case 4:
                    _d.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, axios_1.default.get("https://api.github.com/repos/".concat(GITHUB_REPO, "/releases/latest"), { timeout: 5000, headers: { 'User-Agent': 'deha-cli' } })];
                case 5:
                    res = _d.sent();
                    tag = (_c = res.data.tag_name) !== null && _c !== void 0 ? _c : '';
                    version = tag.replace(/^v/, '');
                    return [2 /*return*/, {
                            latest: version,
                            source: 'github',
                            updateUrl: res.data.html_url,
                        }];
                case 6:
                    _b = _d.sent();
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/, null];
            }
        });
    });
}
// ─── Güncelleme yöntemleri ───────────────────────────────────────────────────
function runNpmUpdate() {
    process.stdout.write(chalk_1.default.dim("  npm install -g ".concat(NPM_PACKAGE, "@latest... ")));
    try {
        (0, child_process_1.execSync)("npm install -g ".concat(NPM_PACKAGE, "@latest"), { stdio: 'pipe' });
        logger_1.logger.write(chalk_1.default.green('✓'));
        logger_1.logger.write(chalk_1.default.green('\n  ✓ DEHA güncellendi! Terminali yeniden başlat.\n'));
    }
    catch (err) {
        logger_1.logger.write(chalk_1.default.red('✗'));
        logger_1.logger.write(chalk_1.default.red('  Hata: ') + (err instanceof Error ? err.message : String(err)));
        printManualUpdate();
    }
}
function runGitUpdate() {
    logger_1.logger.write(chalk_1.default.dim('  git pull + npm build yöntemi kullanılıyor...\n'));
    var steps = [
        { label: 'git pull', cmd: 'git pull origin main' },
        { label: 'npm install', cmd: 'npm install' },
        { label: 'npm run build', cmd: 'npm run build' },
        { label: 'npm link', cmd: 'npm link' },
    ];
    for (var _i = 0, steps_1 = steps; _i < steps_1.length; _i++) {
        var step = steps_1[_i];
        process.stdout.write(chalk_1.default.dim("  ".concat(step.label, "... ")));
        try {
            (0, child_process_1.execSync)(step.cmd, { stdio: 'pipe' });
            logger_1.logger.write(chalk_1.default.green('✓'));
        }
        catch (err) {
            logger_1.logger.write(chalk_1.default.red('✗'));
            logger_1.logger.write(chalk_1.default.red('  Hata: ') + (err instanceof Error ? err.message : String(err)));
            return;
        }
    }
    logger_1.logger.write(chalk_1.default.green('\n  ✓ DEHA güncellendi!\n'));
}
function printManualUpdate() {
    logger_1.logger.write(chalk_1.default.bold('\n  Manuel güncelleme:'));
    if (GITHUB_REPO) {
        logger_1.logger.write(chalk_1.default.dim("  1. cd <deha-cli klas\u00F6r\u00FC>"));
        logger_1.logger.write(chalk_1.default.dim('  2. git pull'));
        logger_1.logger.write(chalk_1.default.dim('  3. npm install && npm run build && npm link'));
    }
    else {
        logger_1.logger.write(chalk_1.default.dim("  npm install -g ".concat(NPM_PACKAGE, "@latest")));
    }
    logger_1.logger.write('');
}
// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function isGlobalNpmInstall() {
    try {
        var result = (0, child_process_1.execSync)("npm list -g ".concat(NPM_PACKAGE, " --depth=0 2>/dev/null"), {
            encoding: 'utf-8', stdio: 'pipe',
        });
        return result.includes(NPM_PACKAGE);
    }
    catch (_a) {
        return false;
    }
}
/** Semantic version karşılaştırma: a > b ise true */
function isNewer(a, b) {
    var parse = function (v) { return v.split('.').map(Number); };
    var _a = parse(a), aMaj = _a[0], aMin = _a[1], aPat = _a[2];
    var _b = parse(b), bMaj = _b[0], bMin = _b[1], bPat = _b[2];
    if (aMaj !== bMaj)
        return aMaj > bMaj;
    if (aMin !== bMin)
        return aMin > bMin;
    return aPat > bPat;
}
