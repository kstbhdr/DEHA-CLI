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
exports.DehaCLI = void 0;
var commander_1 = require("commander");
var chalk_1 = require("chalk");
var config_1 = require("./config");
var interactive_1 = require("./commands/interactive");
var chat_1 = require("./commands/chat");
var setup_1 = require("./commands/setup");
var orchestrator_1 = require("./pipeline/orchestrator");
var update_1 = require("./commands/update");
var commands_1 = require("./mcp/commands");
var commands_2 = require("./conversations/commands");
var terminal_1 = require("./tools/terminal");
var smoke_1 = require("./tools/smoke");
var browser_1 = require("./tools/browser");
var vision_1 = require("./tools/vision");
var doctor_1 = require("./commands/doctor");
var init_1 = require("./commands/init");
var test_runner_1 = require("./commands/test-runner");
var manager_1 = require("./conversations/manager");
var version_1 = require("./version");
var logger_1 = require("./services/logger");
var DehaCLI = /** @class */ (function () {
    function DehaCLI() {
        this.program = new commander_1.Command();
        this.init();
    }
    DehaCLI.prototype.init = function () {
        var _this = this;
        this.program
            .name('deha')
            .description(chalk_1.default.bold('DEHA') + ' — Akıllı AI Kodlama Asistanı')
            .version(version_1.DEHA_VERSION_LABEL, '-v, --version', 'Sürümü göster')
            .option('-p, --provider <provider>', 'Provider: claude|openai|deepseek|ollama|openrouter|xai|custom')
            .option('-k, --api-key <key>', 'API anahtarını doğrudan gir')
            .option('-u, --url <url>', 'Custom API endpoint URL (custom provider için)');
        // ── deha chat "soru" ──────────────────────────────────────────────────
        this.program
            .command('chat <prompt>')
            .description('Tek seferlik streaming soru')
            .action(function (prompt) { return __awaiter(_this, void 0, void 0, function () {
            var config, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = this.buildConfig();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, (0, chat_1.chat)(prompt, config)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        err_1 = _a.sent();
                        logger_1.logger.error('Hata', err_1);
                        process.exit(1);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // ── deha build "görev" ────────────────────────────────────────────────
        this.program
            .command('build <task>')
            .description('Planner/Coder/Judge build akışını çalıştır')
            .option('--coder-provider <p>', 'Coder provider')
            .option('--coder-model <m>', 'Coder model')
            .option('--coder-key <k>', 'Coder API key')
            .option('--coder-url <u>', 'Coder custom API URL')
            .action(function (task, opts) { return __awaiter(_this, void 0, void 0, function () {
            var config, err_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = this.buildConfig();
                        if (opts.coderProvider)
                            config.pipeline.coder.provider = opts.coderProvider;
                        if (opts.coderModel)
                            config.pipeline.coder.model = opts.coderModel;
                        if (opts.coderKey)
                            config.pipeline.coder.apiKey = opts.coderKey;
                        if (opts.coderUrl)
                            config.pipeline.coder.apiUrl = opts.coderUrl;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, (0, orchestrator_1.runPipeline)(task, config)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        err_2 = _a.sent();
                        logger_1.logger.error('Pipeline hatası', err_2);
                        process.exit(1);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // ── deha judge <file> <task...> ──────────────────────────────────────────
        this.program
            .command('judge <file> <task...>')
            .description('Sadece Judge rolünü çalıştırarak bir dosyayı değerlendir')
            .action(function (file, taskParts) { return __awaiter(_this, void 0, void 0, function () {
            var config, task, fs, code, runJudge, verdict, err_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = this.buildConfig();
                        task = taskParts.join(' ');
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('fs'); })];
                    case 1:
                        fs = _a.sent();
                        if (!fs.existsSync(file)) {
                            logger_1.logger.error("Dosya bulunamad\u0131: ".concat(file));
                            process.exit(1);
                        }
                        code = fs.readFileSync(file, 'utf-8');
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 6]);
                        logger_1.logger.write(chalk_1.default.bold("\n\u2696\uFE0F  JUDGE \u00E7al\u0131\u015F\u0131yor... [Dosya: ".concat(file, "]")));
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('./pipeline/judge'); })];
                    case 3:
                        runJudge = (_a.sent()).runJudge;
                        return [4 /*yield*/, runJudge(task, 'Manuel Değerlendirme (No Plan)', code, config, function (chunk) {
                                logger_1.logger.raw(chalk_1.default.yellow(chunk));
                            })];
                    case 4:
                        verdict = _a.sent();
                        logger_1.logger.write('\n' + chalk_1.default.bold('─'.repeat(40)));
                        if (verdict.pass) {
                            logger_1.logger.write(chalk_1.default.bgGreen.black(" \u2713 PASS ") + chalk_1.default.green(" \u2022 Skor: ".concat(verdict.score)));
                        }
                        else {
                            logger_1.logger.write(chalk_1.default.bgRed.white(" \u2717 FAIL ") + chalk_1.default.red(" \u2022 Skor: ".concat(verdict.score)));
                        }
                        return [3 /*break*/, 6];
                    case 5:
                        err_3 = _a.sent();
                        logger_1.logger.error('Judge hatası', err_3);
                        process.exit(1);
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        }); });
        // ── deha setup ────────────────────────────────────────────────────────
        this.program
            .command('setup')
            .description('Bağlantıları test et ve kurulumu doğrula')
            .action(function () { return __awaiter(_this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = this.buildConfig();
                        return [4 /*yield*/, (0, setup_1.setup)(config)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        // ── deha update ───────────────────────────────────────────────────────
        this.program
            .command('update')
            .description('Güncelleme kontrol et ve kur')
            .action(function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, update_1.runUpdate)()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        }); }); });
        // ── deha mcp <alt-komut> ──────────────────────────────────────────────
        this.program
            .command('mcp [args...]')
            .description('MCP sunucu yönetimi (list, install, add, remove, catalog)')
            .action(function (args) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, commands_1.handleMcpCommand)(args.join(' '))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        // ── deha history [args] ───────────────────────────────────────────────
        this.program
            .command('history [args...]')
            .description('Eski sohbetleri listele veya görüntüle')
            .action(function (args) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, commands_2.handleHistoryCommand)(args.join(' '))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        // ── deha run <komut> ─────────────────────────────────────────────────
        this.program
            .command('run <command...>')
            .description('Terminal komutu çalıştır (streaming output)')
            .option('-d, --dir <path>', 'Çalışma dizini')
            .option('-t, --timeout <sec>', 'Timeout saniye', '60')
            .action(function (cmdParts, opts) { return __awaiter(_this, void 0, void 0, function () {
            var cmd, r, err_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cmd = cmdParts.join(' ');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, (0, terminal_1.runCommand)(cmd, {
                                cwd: opts.dir,
                                timeout: parseInt(opts.timeout, 10) * 1000,
                                stream: true, shell: true,
                            })];
                    case 2:
                        r = _a.sent();
                        process.exit(r.exitCode);
                        return [3 /*break*/, 4];
                    case 3:
                        err_4 = _a.sent();
                        logger_1.logger.error('Hata', err_4);
                        process.exit(1);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // ── deha python <dosya veya -c kod> ─────────────────────────────────
        this.program
            .command('python [file]')
            .description('Python dosyası veya satır içi kodu çalıştır')
            .option('-c, --code <code>', 'Çalıştırılacak Python kodu')
            .option('-p, --packages <pkgs>', 'Kurulacak pip paketleri (virgülle)')
            .option('--venv', 'Sanal ortam kullan')
            .action(function (file, opts) { return __awaiter(_this, void 0, void 0, function () {
            var _a, rpc, detectPython, python, code, packages, r;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./tools/python'); })];
                    case 1:
                        _a = _c.sent(), rpc = _a.runPythonCode, detectPython = _a.detectPython;
                        return [4 /*yield*/, detectPython()];
                    case 2:
                        python = _c.sent();
                        if (!python) {
                            logger_1.logger.error('Python bulunamadı');
                            process.exit(1);
                        }
                        code = (_b = opts.code) !== null && _b !== void 0 ? _b : (file ? require('fs').readFileSync(file, 'utf-8') : '');
                        if (!code) {
                            logger_1.logger.error('Kod veya dosya gerekli');
                            process.exit(1);
                        }
                        packages = opts.packages ? opts.packages.split(',').map(function (s) { return s.trim(); }) : [];
                        return [4 /*yield*/, rpc(code, { installPackages: packages })];
                    case 3:
                        r = _c.sent();
                        if (r.stdout)
                            process.stdout.write(r.stdout);
                        if (r.stderr)
                            process.stderr.write(r.stderr);
                        process.exit(r.exitCode);
                        return [2 /*return*/];
                }
            });
        }); });
        // ── deha smoketest <url> ─────────────────────────────────────────────
        this.program
            .command('smoketest <url>')
            .description('HTTP smoke testleri çalıştır')
            .option('-r, --routes <routes>', 'Test edilecek rotalar (virgülle)', '/')
            .option('-s, --status <code>', 'Beklenen status kodu')
            .option('-m, --max-ms <ms>', 'Maksimum yanıt süresi')
            .action(function (url, opts) { return __awaiter(_this, void 0, void 0, function () {
            var routes, checks, report;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        routes = opts.routes.split(',').map(function (r) { return r.trim(); });
                        checks = (0, smoke_1.buildQuickChecks)(url, routes);
                        if (opts.status)
                            checks.forEach(function (c) { c.expectedStatus = parseInt(opts.status, 10); });
                        if (opts.maxMs)
                            checks.forEach(function (c) { c.maxMs = parseInt(opts.maxMs, 10); });
                        return [4 /*yield*/, (0, smoke_1.runSmokeTests)(checks)];
                    case 1:
                        report = _a.sent();
                        (0, smoke_1.printSmokeReport)(report);
                        process.exit(report.failed > 0 ? 1 : 0);
                        return [2 /*return*/];
                }
            });
        }); });
        // ── deha screenshot <url> ────────────────────────────────────────────
        this.program
            .command('screenshot <url>')
            .description('Web sayfasının ekran görüntüsünü al')
            .option('-o, --output <path>', 'Kayıt yolu')
            .option('--full-page', 'Tüm sayfayı yakala')
            .option('-w, --wait <ms>', 'Sayfa yükleme bekleme (ms)', '1500')
            .action(function (url, opts) { return __awaiter(_this, void 0, void 0, function () {
            var p, err_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        logger_1.logger.raw(chalk_1.default.dim('Screenshot alınıyor... '));
                        return [4 /*yield*/, (0, browser_1.takeScreenshot)(url, {
                                fullPage: opts.fullPage,
                                outputPath: opts.output,
                                waitMs: parseInt(opts.wait, 10),
                            })];
                    case 1:
                        p = _a.sent();
                        logger_1.logger.write(chalk_1.default.green('✓'));
                        logger_1.logger.write(chalk_1.default.dim("Kaydedildi: ".concat(p)));
                        return [3 /*break*/, 3];
                    case 2:
                        err_5 = _a.sent();
                        logger_1.logger.error('Screenshot hatası', err_5);
                        logger_1.logger.write(chalk_1.default.dim('Playwright için: npx playwright install chromium'));
                        process.exit(1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // ── deha vision <url veya dosya> ─────────────────────────────────────
        this.program
            .command('vision <target>')
            .description('URL veya görüntü dosyasını vision model ile analiz et')
            .option('-q, --prompt <text>', 'Vision modele özel soru')
            .option('--full-page', 'Tam sayfa screenshot')
            .action(function (target, opts) { return __awaiter(_this, void 0, void 0, function () {
            var config, _a, screenshotPath, analysis, analyzeExistingImage, analysis, err_6;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        config = this.buildConfig();
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 7, , 8]);
                        if (!target.startsWith('http')) return [3 /*break*/, 3];
                        logger_1.logger.raw(chalk_1.default.dim('Screenshot + analiz yapılıyor...\n\n'));
                        return [4 /*yield*/, (0, vision_1.screenshotAndAnalyze)(target, config, {
                                prompt: opts.prompt, fullPage: opts.fullPage,
                            })];
                    case 2:
                        _a = _b.sent(), screenshotPath = _a.screenshotPath, analysis = _a.analysis;
                        logger_1.logger.write(chalk_1.default.dim("Screenshot: ".concat(screenshotPath, "\n")));
                        logger_1.logger.write(analysis);
                        return [3 /*break*/, 6];
                    case 3: return [4 /*yield*/, Promise.resolve().then(function () { return require('./tools/vision'); })];
                    case 4:
                        analyzeExistingImage = (_b.sent()).analyzeExistingImage;
                        return [4 /*yield*/, analyzeExistingImage(target, config, opts.prompt)];
                    case 5:
                        analysis = _b.sent();
                        logger_1.logger.write(analysis);
                        _b.label = 6;
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        err_6 = _b.sent();
                        logger_1.logger.error('Vision hatası', err_6);
                        process.exit(1);
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        }); });
        // ── deha stats ────────────────────────────────────────────────────────
        this.program
            .command('stats')
            .description('Token usage and cost statistics (daily/weekly/monthly)')
            .action(function () {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            var printStats = require('./services/usage-tracker').printStats;
            printStats();
        });
        // ── deha init ─────────────────────────────────────────────────────────
        this.program
            .command('init')
            .description('Proje başlatma: .env, API keys, MCP, Playwright kurulumu')
            .action(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, init_1.initCommand)()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        // ── deha resume <id> ──────────────────────────────────────────────────
        this.program
            .command('resume <id>')
            .description('Önceki bir sohbeti ID ile devam ettir')
            .action(function (id) { return __awaiter(_this, void 0, void 0, function () {
            var config, messages;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = this.buildConfig();
                        messages = (0, manager_1.loadConversationMessages)(id);
                        if (!messages) {
                            logger_1.logger.error("Sohbet bulunamad\u0131: ".concat(id));
                            process.exit(1);
                        }
                        return [4 /*yield*/, (0, interactive_1.interactive)(config, messages, id)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        // ── deha test ─────────────────────────────────────────────────────────
        this.program
            .command('test')
            .description('API bağlantı ve pipeline entegrasyon testleri')
            .action(function () { return __awaiter(_this, void 0, void 0, function () {
            var config, err_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = this.buildConfig();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, (0, test_runner_1.runSystemTest)(config)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        err_7 = _a.sent();
                        logger_1.logger.error('Test hatası', err_7);
                        process.exit(1);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // ── deha doctor ──────────────────────────────────────────────────────
        this.program
            .command('doctor')
            .description('Sistem tanılaması: bağımlılık, config ve ortam kontrolleri')
            .action(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, doctor_1.doctor)()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        // ── deha (default: interaktif mod) ────────────────────────────────────
        this.program.action(function () { return __awaiter(_this, void 0, void 0, function () {
            var config;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        config = this.buildConfig();
                        return [4 /*yield*/, (0, interactive_1.interactive)(config)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    };
    DehaCLI.prototype.buildConfig = function () {
        var opts = this.program.opts();
        var overrides = {};
        if (opts.provider)
            overrides.provider = opts.provider;
        if (opts.url)
            overrides.customApiUrl = opts.url;
        if (opts.apiKey) {
            var p = opts.provider || process.env.DEHA_PROVIDER || 'claude';
            if (p === 'claude')
                overrides.anthropicApiKey = opts.apiKey;
            if (p === 'openai')
                overrides.openaiApiKey = opts.apiKey;
            if (p === 'deepseek')
                overrides.deepseekApiKey = opts.apiKey;
            if (p === 'openrouter')
                overrides.openrouterApiKey = opts.apiKey;
            if (p === 'xai')
                overrides.xaiApiKey = opts.apiKey;
            if (p === 'custom')
                overrides.customApiKey = opts.apiKey;
        }
        return (0, config_1.getConfig)(overrides);
    };
    DehaCLI.prototype.run = function () {
        return __awaiter(this, void 0, void 0, function () {
            var nonOptionArgs, config, knownCommands, firstArg;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        nonOptionArgs = process.argv.slice(2).filter(function (a) { return !a.startsWith('-'); });
                        if (!(nonOptionArgs.length === 0)) return [3 /*break*/, 4];
                        if (!(process.argv.length === 2)) return [3 /*break*/, 2];
                        config = this.buildConfig();
                        return [4 /*yield*/, (0, interactive_1.interactive)(config)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                    case 2: 
                    // --help veya --version → commander halletsin
                    return [4 /*yield*/, this.program.parseAsync(process.argv)];
                    case 3:
                        // --help veya --version → commander halletsin
                        _a.sent();
                        return [2 /*return*/];
                    case 4:
                        knownCommands = this.program.commands.map(function (c) { return c.name(); });
                        firstArg = nonOptionArgs[0];
                        if (!knownCommands.includes(firstArg)) {
                            logger_1.logger.write(chalk_1.default.red("\n\u2717 Bilinmeyen komut: \"".concat(firstArg, "\"\n")));
                            logger_1.logger.write(chalk_1.default.dim("Mevcut komutlar: ".concat(knownCommands.join(', '), "\n\n")));
                            process.exit(1);
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, this.program.parseAsync(process.argv)];
                    case 5:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return DehaCLI;
}());
exports.DehaCLI = DehaCLI;
