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
exports.handleMcpCommand = handleMcpCommand;
var child_process_1 = require("child_process");
var chalk_1 = require("chalk");
var config_1 = require("./config");
var manager_1 = require("./manager");
var logger_1 = require("../services/logger");
function handleMcpCommand(args) {
    return __awaiter(this, void 0, void 0, function () {
        var parts, sub;
        return __generator(this, function (_a) {
            parts = args.trim().split(/\s+/);
            sub = parts[0];
            switch (sub) {
                case 'list': return [2 /*return*/, mcpList()];
                case 'status': return [2 /*return*/, mcpStatus()];
                case 'add': return [2 /*return*/, mcpAdd(parts.slice(1))];
                case 'remove': return [2 /*return*/, mcpRemove(parts[1])];
                case 'install': return [2 /*return*/, mcpInstall(parts[1])];
                case 'catalog': return [2 /*return*/, mcpCatalog()];
                default:
                    logger_1.logger.write(mcpHelp());
            }
            return [2 /*return*/];
        });
    });
}
// ─── /mcp list ──────────────────────────────────────────────────────────────
function mcpList() {
    var _a, _b;
    var config = (0, config_1.readMcpConfig)();
    var names = Object.keys(config.servers);
    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('═══ MCP Sunucuları ═══'));
    logger_1.logger.write(chalk_1.default.dim("  Config: ".concat((0, config_1.getMcpConfigPath)(), "\n")));
    if (names.length === 0) {
        logger_1.logger.write(chalk_1.default.dim('  Henüz kayıtlı sunucu yok.'));
        logger_1.logger.write(chalk_1.default.dim('  /mcp catalog  → kurulabilir sunucuları gör'));
        logger_1.logger.write(chalk_1.default.dim('  /mcp install filesystem  → hazır sunucu kur'));
        logger_1.logger.write('');
        return;
    }
    for (var _i = 0, names_1 = names; _i < names_1.length; _i++) {
        var name_1 = names_1[_i];
        var cfg = config.servers[name_1];
        logger_1.logger.write(chalk_1.default.green('  ●') + ' ' + chalk_1.default.bold(name_1));
        logger_1.logger.write(chalk_1.default.dim("    ".concat((_a = cfg.description) !== null && _a !== void 0 ? _a : '')));
        logger_1.logger.write(chalk_1.default.dim("    cmd: ".concat(cfg.command, " ").concat(((_b = cfg.args) !== null && _b !== void 0 ? _b : []).join(' '))));
    }
    logger_1.logger.write('');
}
// ─── /mcp status ────────────────────────────────────────────────────────────
function mcpStatus() {
    var servers = manager_1.mcpManager.getServerList();
    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('═══ MCP Bağlantı Durumu ═══\n'));
    if (servers.length === 0) {
        logger_1.logger.write(chalk_1.default.dim('  Aktif MCP bağlantısı yok.\n'));
        return;
    }
    for (var _i = 0, servers_1 = servers; _i < servers_1.length; _i++) {
        var s = servers_1[_i];
        logger_1.logger.write(chalk_1.default.green('  ✓ ') + chalk_1.default.bold(s.name) + chalk_1.default.dim(" (".concat(s.toolCount, " ara\u00E7)")));
        for (var _a = 0, _b = s.tools; _a < _b.length; _a++) {
            var t = _b[_a];
            logger_1.logger.write(chalk_1.default.dim("      \u2022 ".concat(t)));
        }
    }
    logger_1.logger.write('');
}
// ─── /mcp install <name> ────────────────────────────────────────────────────
function mcpInstall(name) {
    if (!name) {
        logger_1.logger.write(chalk_1.default.red('\n  Kullanım: /mcp install <sunucu-adı>'));
        logger_1.logger.write(chalk_1.default.dim('  /mcp catalog → mevcut sunucuları gör\n'));
        return;
    }
    var known = config_1.KNOWN_SERVERS[name];
    if (!known) {
        logger_1.logger.write(chalk_1.default.red("\n  Bilinmeyen sunucu: ".concat(name)));
        logger_1.logger.write(chalk_1.default.dim('  /mcp catalog → desteklenen sunucuları gör\n'));
        return;
    }
    logger_1.logger.write(chalk_1.default.cyan("\n  Kuruluyor: ".concat(name, " \u2014 ").concat(known.description)));
    // npm paketi global yükle
    for (var _i = 0, _a = known.packages; _i < _a.length; _i++) {
        var pkg = _a[_i];
        logger_1.logger.raw(chalk_1.default.dim("  npm install -g ".concat(pkg, "... ")));
        try {
            (0, child_process_1.execSync)("npm install -g ".concat(pkg), { stdio: 'pipe' });
            logger_1.logger.write(chalk_1.default.green('✓'));
        }
        catch (err) {
            var message = err instanceof Error ? err.message : String(err);
            logger_1.logger.write(chalk_1.default.red('✗') + chalk_1.default.dim(" (".concat(message.split('\n')[0], ")")));
        }
    }
    // Config'e ekle
    (0, config_1.addServer)(name, known.config);
    logger_1.logger.write(chalk_1.default.green("\n  \u2713 '".concat(name, "' mcp.json'a eklendi.")));
    if (known.config.env && Object.keys(known.config.env).length > 0) {
        logger_1.logger.write(chalk_1.default.yellow('\n  ⚠ Çevresel değişken gerekiyor:'));
        for (var _b = 0, _c = Object.entries(known.config.env); _b < _c.length; _b++) {
            var _d = _c[_b], k = _d[0], v = _d[1];
            logger_1.logger.write(chalk_1.default.dim("    ".concat(k, "=").concat(v)));
        }
        logger_1.logger.write(chalk_1.default.dim("    D\u00FCzenle: ".concat((0, config_1.getMcpConfigPath)(), "\n")));
    }
    else {
        logger_1.logger.write(chalk_1.default.dim('  Yeniden başlat veya /mcp reconnect yap.\n'));
    }
}
// ─── /mcp add <name> <command> [args...] ────────────────────────────────────
function mcpAdd(parts) {
    if (parts.length < 2) {
        logger_1.logger.write(chalk_1.default.red('\n  Kullanım: /mcp add <isim> <komut> [argümanlar...]'));
        logger_1.logger.write(chalk_1.default.dim('  Örnek: /mcp add myserver npx -y my-mcp-server\n'));
        return;
    }
    var name = parts[0];
    var command = parts[1];
    var args = parts.slice(2);
    var cfg = { command: command, args: args };
    (0, config_1.addServer)(name, cfg);
    logger_1.logger.write(chalk_1.default.green("\n  \u2713 '".concat(name, "' eklendi \u2192 ").concat((0, config_1.getMcpConfigPath)(), "\n")));
}
// ─── /mcp remove <name> ─────────────────────────────────────────────────────
function mcpRemove(name) {
    if (!name) {
        logger_1.logger.write(chalk_1.default.red('\n  Kullanım: /mcp remove <isim>\n'));
        return;
    }
    var ok = (0, config_1.removeServer)(name);
    if (ok) {
        logger_1.logger.write(chalk_1.default.green("\n  \u2713 '".concat(name, "' kald\u0131r\u0131ld\u0131.\n")));
    }
    else {
        logger_1.logger.write(chalk_1.default.red("\n  '".concat(name, "' bulunamad\u0131.\n")));
    }
}
// ─── /mcp catalog ───────────────────────────────────────────────────────────
function mcpCatalog() {
    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('═══ Kurulabilir MCP Sunucuları ═══\n'));
    for (var _i = 0, _a = Object.entries(config_1.KNOWN_SERVERS); _i < _a.length; _i++) {
        var _b = _a[_i], name_2 = _b[0], info = _b[1];
        logger_1.logger.write(chalk_1.default.bold("  ".concat(name_2.padEnd(16))) +
            chalk_1.default.white(info.description));
        logger_1.logger.write(chalk_1.default.dim("  ".concat(''.padEnd(16), "/mcp install ").concat(name_2)));
    }
    logger_1.logger.write('');
}
// ─── Yardım ─────────────────────────────────────────────────────────────────
function mcpHelp() {
    return "\n".concat(chalk_1.default.bold('MCP Komutları:'), "\n  ").concat(chalk_1.default.cyan('/mcp list'), "                     Kay\u0131tl\u0131 sunucular\u0131 g\u00F6ster\n  ").concat(chalk_1.default.cyan('/mcp status'), "                   Aktif ba\u011Flant\u0131lar\u0131 g\u00F6ster\n  ").concat(chalk_1.default.cyan('/mcp catalog'), "                  Kurulabilir sunucular\u0131 listele\n  ").concat(chalk_1.default.cyan('/mcp install <isim>'), "           Bilinen sunucuyu kur ve ekle\n  ").concat(chalk_1.default.cyan('/mcp add <isim> <cmd> [args]'), " Manuel sunucu ekle\n  ").concat(chalk_1.default.cyan('/mcp remove <isim>'), "            Sunucuyu kald\u0131r\n");
}
