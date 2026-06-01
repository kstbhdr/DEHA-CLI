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
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcCost = calcCost;
exports.recordUsage = recordUsage;
exports.getStats = getStats;
exports.getUsageSnapshot = getUsageSnapshot;
exports.getUsageSince = getUsageSince;
exports.printStats = printStats;
exports.printSessionSummary = printSessionSummary;
var fs = require("fs");
var path = require("path");
var os = require("os");
var chalk_1 = require("chalk");
var logger_1 = require("./logger");
// ─── File path ───────────────────────────────────────────────────────────────
var USAGE_DIR = path.join(os.homedir(), '.deha');
var USAGE_FILE = path.join(USAGE_DIR, 'usage.json');
// ─── Read / Write ─────────────────────────────────────────────────────────────
function readStore() {
    try {
        if (!fs.existsSync(USAGE_FILE))
            return { entries: [] };
        return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
    }
    catch (_a) {
        return { entries: [] };
    }
}
function writeStore(store) {
    if (!fs.existsSync(USAGE_DIR))
        fs.mkdirSync(USAGE_DIR, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}
// ─── Pricing helpers ─────────────────────────────────────────────────────────
function calcCost(role, inputTokens, outputTokens, config, cacheTokens) {
    var _a;
    if (cacheTokens === void 0) { cacheTokens = 0; }
    var priceMap = {
        chat: [config.chatInputPrice, config.chatOutputPrice],
        planner: [config.plannerInputPrice, config.plannerOutputPrice],
        coder: [config.coderInputPrice, config.coderOutputPrice],
        judge: [config.judgeInputPrice, config.judgeOutputPrice],
        vision: [config.visionInputPrice, config.visionOutputPrice],
        agent: [config.agentInputPrice, config.agentOutputPrice],
    };
    var _b = (_a = priceMap[role]) !== null && _a !== void 0 ? _a : [0, 0], inp = _b[0], out = _b[1];
    // Caching usually discount input price significantly (e.g. 10x or 90%)
    // For simplicity, we'll assume cached tokens cost 10% of input tokens if not specified
    var uncachedInput = Math.max(0, inputTokens - cacheTokens);
    var inputCost = (uncachedInput / 1000000) * inp + (cacheTokens / 1000000) * (inp * 0.1);
    var outputCost = (outputTokens / 1000000) * out;
    return inputCost + outputCost;
}
// ─── Record a usage event ─────────────────────────────────────────────────────
function recordUsage(provider, model, role, inputTokens, outputTokens, config, reasoningTokens, cacheTokens) {
    if (reasoningTokens === void 0) { reasoningTokens = 0; }
    if (cacheTokens === void 0) { cacheTokens = 0; }
    if (inputTokens === 0 && outputTokens === 0)
        return;
    var store = readStore();
    var normalizedReasoning = Math.max(0, Math.floor(reasoningTokens));
    var normalizedCache = Math.max(0, Math.floor(cacheTokens));
    store.entries.push(__assign(__assign(__assign({ timestamp: new Date().toISOString(), provider: provider, model: model, role: role, inputTokens: inputTokens, outputTokens: outputTokens }, (normalizedReasoning > 0 ? { reasoningTokens: normalizedReasoning } : {})), (normalizedCache > 0 ? { cacheTokens: normalizedCache } : {})), { costUsd: calcCost(role, inputTokens, outputTokens, config, normalizedCache) }));
    // Keep only last 10 000 entries to prevent unbounded growth
    if (store.entries.length > 10000)
        store.entries = store.entries.slice(-10000);
    writeStore(store);
}
function emptyPeriod() {
    return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheTokens: 0, totalTokens: 0, costUsd: 0, calls: 0, byModel: {}, byRole: {} };
}
function addEntry(period, e) {
    var _a, _b, _c;
    var reasoningTokens = (_a = e.reasoningTokens) !== null && _a !== void 0 ? _a : 0;
    period.inputTokens += e.inputTokens;
    period.outputTokens += e.outputTokens;
    period.reasoningTokens += reasoningTokens;
    period.totalTokens += e.inputTokens + e.outputTokens;
    period.costUsd += e.costUsd;
    period.calls += 1;
    var mk = "".concat(e.provider, "/").concat(e.model);
    if (!period.byModel[mk])
        period.byModel[mk] = { input: 0, output: 0, reasoning: 0, cache: 0, cost: 0, calls: 0 };
    period.byModel[mk].input += e.inputTokens;
    period.byModel[mk].output += e.outputTokens;
    period.byModel[mk].reasoning += reasoningTokens;
    period.byModel[mk].cache += (_b = e.cacheTokens) !== null && _b !== void 0 ? _b : 0;
    period.byModel[mk].cost += e.costUsd;
    period.byModel[mk].calls += 1;
    if (!period.byRole[e.role])
        period.byRole[e.role] = { input: 0, output: 0, reasoning: 0, cache: 0, cost: 0, calls: 0 };
    period.byRole[e.role].input += e.inputTokens;
    period.byRole[e.role].output += e.outputTokens;
    period.byRole[e.role].reasoning += reasoningTokens;
    period.byRole[e.role].cache += (_c = e.cacheTokens) !== null && _c !== void 0 ? _c : 0;
    period.byRole[e.role].cost += e.costUsd;
    period.byRole[e.role].calls += 1;
}
function getStats() {
    var store = readStore();
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var weekStart = todayStart - 6 * 86400000;
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var today = emptyPeriod();
    var week = emptyPeriod();
    var month = emptyPeriod();
    var allTime = emptyPeriod();
    for (var _i = 0, _a = store.entries; _i < _a.length; _i++) {
        var e = _a[_i];
        var t = new Date(e.timestamp).getTime();
        addEntry(allTime, e);
        if (t >= monthStart)
            addEntry(month, e);
        if (t >= weekStart)
            addEntry(week, e);
        if (t >= todayStart)
            addEntry(today, e);
    }
    return { today: today, week: week, month: month, allTime: allTime };
}
function getUsageSnapshot() {
    return readStore().entries.length;
}
function getUsageSince(snapshot) {
    var store = readStore();
    var summary = emptyPeriod();
    for (var _i = 0, _a = store.entries.slice(snapshot); _i < _a.length; _i++) {
        var entry = _a[_i];
        addEntry(summary, entry);
    }
    return summary;
}
// ─── Display ──────────────────────────────────────────────────────────────────
function printStats() {
    var _a = getStats(), today = _a.today, week = _a.week, month = _a.month, allTime = _a.allTime;
    logger_1.logger.write('\n' + chalk_1.default.bold.cyan('╔══════════════════════════════════════════════════════╗'));
    logger_1.logger.write(chalk_1.default.bold.cyan('║') + chalk_1.default.bold.white('   DEHA — Token & Cost Statistics') + ' '.repeat(21) + chalk_1.default.bold.cyan('║'));
    logger_1.logger.write(chalk_1.default.bold.cyan('╚══════════════════════════════════════════════════════╝'));
    printPeriod('Today', today);
    printPeriod('This Week (last 7 days)', week);
    printPeriod('This Month', month);
    printPeriod('All Time', allTime);
    logger_1.logger.write('');
}
function printPeriod(label, p) {
    var _a;
    if (p.calls === 0) {
        logger_1.logger.write('\n' + chalk_1.default.bold("  \u2500\u2500 ".concat(label, " \u2500\u2500")) + chalk_1.default.dim('  (no data)'));
        return;
    }
    logger_1.logger.write('\n' + chalk_1.default.bold("  \u2500\u2500 ".concat(label, " \u2500\u2500")));
    logger_1.logger.write("  ".concat(chalk_1.default.dim('Calls:'), "  ").concat(chalk_1.default.white(p.calls), "   ") +
        "".concat(chalk_1.default.dim('Tokens:'), "  ").concat(chalk_1.default.yellow(fmt(p.totalTokens)), " ") +
        "".concat(chalk_1.default.dim('(in:'), " ").concat(chalk_1.default.dim(fmt(p.inputTokens)), " ").concat(chalk_1.default.dim('out:'), " ").concat(chalk_1.default.dim(fmt(p.outputTokens))).concat(chalk_1.default.dim(')'), "   ") +
        "".concat(p.reasoningTokens > 0 ? chalk_1.default.dim('thinking: ') + chalk_1.default.dim(fmt(p.reasoningTokens)) + '   ' : '') +
        "".concat(p.cacheTokens > 0 ? chalk_1.default.cyan('cached: ') + chalk_1.default.cyan(fmt(p.cacheTokens)) + '   ' : '') +
        "".concat(chalk_1.default.dim('Cost:'), "  ").concat(chalk_1.default.green('$' + p.costUsd.toFixed(4))));
    // By model
    if (Object.keys(p.byModel).length > 0) {
        logger_1.logger.write('\n  ' + chalk_1.default.dim('By model:'));
        var sorted = Object.entries(p.byModel).sort(function (a, b) { return b[1].cost - a[1].cost; });
        for (var _i = 0, sorted_1 = sorted; _i < sorted_1.length; _i++) {
            var _b = sorted_1[_i], model = _b[0], s = _b[1];
            logger_1.logger.write("    ".concat(chalk_1.default.cyan(model.padEnd(40)), " ") +
                "".concat(chalk_1.default.dim('calls:'), " ").concat(String(s.calls).padStart(4), "  ") +
                "".concat(chalk_1.default.dim('tokens:'), " ").concat(fmt(s.input + s.output).padStart(9), "  ") +
                "".concat(s.reasoning > 0 ? chalk_1.default.dim('thinking:') + ' ' + fmt(s.reasoning).padStart(7) + '  ' : '') +
                "".concat(s.cache > 0 ? chalk_1.default.cyan('cached:') + ' ' + fmt(s.cache).padStart(7) + '  ' : '') +
                "".concat(chalk_1.default.green('$' + s.cost.toFixed(4))));
        }
    }
    // By role
    if (Object.keys(p.byRole).length > 0) {
        logger_1.logger.write('\n  ' + chalk_1.default.dim('By role:'));
        var roleOrder = ['chat', 'planner', 'coder', 'judge', 'vision', 'agent'];
        var roles = roleOrder.filter(function (r) { return p.byRole[r]; });
        for (var _c = 0, roles_1 = roles; _c < roles_1.length; _c++) {
            var role = roles_1[_c];
            var s = p.byRole[role];
            var icon = {
                chat: '💬', planner: '📐', coder: '💻', judge: '⚖️ ', vision: '👁️ ', agent: '🤖',
            };
            logger_1.logger.write("    ".concat(((_a = icon[role]) !== null && _a !== void 0 ? _a : '•') + ' ' + chalk_1.default.yellow(role.padEnd(10)), " ") +
                "".concat(chalk_1.default.dim('calls:'), " ").concat(String(s.calls).padStart(4), "  ") +
                "".concat(chalk_1.default.dim('tokens:'), " ").concat(fmt(s.input + s.output).padStart(9), "  ") +
                "".concat(s.reasoning > 0 ? chalk_1.default.dim('thinking:') + ' ' + fmt(s.reasoning).padStart(7) + '  ' : '') +
                "".concat(s.cache > 0 ? chalk_1.default.cyan('cached:') + ' ' + fmt(s.cache).padStart(7) + '  ' : '') +
                "".concat(chalk_1.default.green('$' + s.cost.toFixed(4))));
        }
    }
}
function printSessionSummary(summary) {
    logger_1.logger.write('\n' + chalk_1.default.bold('  ── This Session ──'));
    if (summary.calls === 0) {
        logger_1.logger.write(chalk_1.default.dim('  No token usage recorded in this session.'));
        return;
    }
    logger_1.logger.write("  ".concat(chalk_1.default.dim('Calls:'), " ").concat(chalk_1.default.white(summary.calls), "  ") +
        "".concat(chalk_1.default.dim('Tokens:'), " ").concat(chalk_1.default.yellow(fmt(summary.totalTokens)), " ") +
        "".concat(chalk_1.default.dim('(in:'), " ").concat(chalk_1.default.dim(fmt(summary.inputTokens)), " ").concat(chalk_1.default.dim('out:'), " ").concat(chalk_1.default.dim(fmt(summary.outputTokens))).concat(chalk_1.default.dim(')'), "  ") +
        "".concat(summary.reasoningTokens > 0 ? chalk_1.default.dim('thinking: ') + chalk_1.default.dim(fmt(summary.reasoningTokens)) + '  ' : '') +
        "".concat(summary.cacheTokens > 0 ? chalk_1.default.cyan('cached: ') + chalk_1.default.cyan(fmt(summary.cacheTokens)) + '  ' : '') +
        "".concat(chalk_1.default.dim('Cost:'), " ").concat(chalk_1.default.green('$' + summary.costUsd.toFixed(4))));
    var models = Object.entries(summary.byModel).sort(function (a, b) { return b[1].cost - a[1].cost; });
    if (models.length > 0) {
        logger_1.logger.write(chalk_1.default.dim('  By model:'));
        for (var _i = 0, models_1 = models; _i < models_1.length; _i++) {
            var _a = models_1[_i], model = _a[0], s = _a[1];
            logger_1.logger.write("    ".concat(chalk_1.default.cyan(model.padEnd(40)), " ") +
                "".concat(chalk_1.default.dim('in:'), " ").concat(fmt(s.input).padStart(8), "  ") +
                "".concat(chalk_1.default.dim('out:'), " ").concat(fmt(s.output).padStart(8), "  ") +
                "".concat(s.reasoning > 0 ? chalk_1.default.dim('thinking:') + ' ' + fmt(s.reasoning).padStart(8) + '  ' : '') +
                "".concat(s.cache > 0 ? chalk_1.default.cyan('cached:') + ' ' + fmt(s.cache).padStart(8) + '  ' : '') +
                "".concat(chalk_1.default.green('$' + s.cost.toFixed(4))));
        }
    }
}
function fmt(n) {
    if (n >= 1000000)
        return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000)
        return (n / 1000).toFixed(1) + 'K';
    return String(n);
}
