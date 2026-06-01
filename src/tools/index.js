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
exports.DEHA_TOOLS = void 0;
exports.executeTool = executeTool;
exports.executeToolAsync = executeToolAsync;
exports.printToolCall = printToolCall;
exports.isSafeCommand = isSafeCommand;
var fs = require("fs");
var path = require("path");
var child_process_1 = require("child_process");
var chalk_1 = require("chalk");
var terminal_1 = require("./terminal");
var python_1 = require("./python");
var smoke_1 = require("./smoke");
var browser_1 = require("./browser");
var search_1 = require("./search");
var edit_1 = require("./edit");
var logger_1 = require("../services/logger");
// vision tool requires DehaConfig, handled separately in agent.ts
// ─── Tool definitions (Claude API schema) ──────────────────────────────────
exports.DEHA_TOOLS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file. Use for code analysis, debugging, or file inspection.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path (absolute or relative)' },
                start_line: { type: 'number', description: 'Start line (optional)' },
                end_line: { type: 'number', description: 'End line (optional)' },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description: 'Write or overwrite a file. Use only for new files — prefer edit_file for existing ones.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path to write' },
                content: { type: 'string', description: 'Content to write' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'edit_file',
        description: 'Edit a specific part of a file without rewriting the whole thing. Saves tokens vs write_file. Requires exact string match including whitespace.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path to edit' },
                old_string: { type: 'string', description: 'Exact string to replace (whitespace sensitive)' },
                new_string: { type: 'string', description: 'Replacement string' },
                replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
            },
            required: ['path', 'old_string', 'new_string'],
        },
    },
    {
        name: 'insert_lines',
        description: 'Insert lines into a file before a given line number.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path' },
                line: { type: 'number', description: 'Insert BEFORE this line (1-indexed, 0 = prepend)' },
                content: { type: 'string', description: 'Content to insert' },
            },
            required: ['path', 'line', 'content'],
        },
    },
    {
        name: 'delete_lines',
        description: 'Delete a range of lines from a file.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path' },
                from_line: { type: 'number', description: 'Start line (1-indexed, inclusive)' },
                to_line: { type: 'number', description: 'End line (1-indexed, inclusive)' },
            },
            required: ['path', 'from_line', 'to_line'],
        },
    },
    {
        name: 'list_dir',
        description: 'List the contents of a directory.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Directory path' },
                recursive: { type: 'boolean', description: 'Include subdirectories (default: false)' },
            },
            required: ['path'],
        },
    },
    {
        name: 'run_shell',
        description: 'Run a shell command. Use for builds, tests, git operations, etc. Safe commands only — destructive operations are blocked.',
        input_schema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Command to run (max 2000 chars, destructive commands blocked)' },
                cwd: { type: 'string', description: 'Working directory (must be within project root)' },
                timeout: { type: 'number', description: 'Timeout in seconds (default: 30, max: 60)' },
            },
            required: ['command'],
        },
    },
    {
        name: 'run_terminal',
        description: 'Run a shell command with streaming output, timeout, and env var support.',
        input_schema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Command to run' },
                cwd: { type: 'string', description: 'Working directory' },
                timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
                env: { type: 'object', description: 'Additional environment variables' },
            },
            required: ['command'],
        },
    },
    {
        name: 'run_python',
        description: 'Execute Python code from a snippet or file path. Supports pip install and virtualenv.',
        input_schema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'Python code to execute' },
                file: { type: 'string', description: 'Path to a .py file to run' },
                packages: { type: 'array', items: { type: 'string' }, description: 'pip packages to install before running' },
                cwd: { type: 'string', description: 'Working directory' },
                timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
                use_venv: { type: 'boolean', description: 'Use a virtual environment' },
            },
        },
    },
    {
        name: 'search_in_files',
        description: 'Search for a text pattern across files in a directory (like grep).',
        input_schema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Text or regex pattern to search for' },
                directory: { type: 'string', description: 'Directory to search in' },
                extension: { type: 'string', description: 'File extension filter (e.g. .ts, .py)' },
            },
            required: ['pattern', 'directory'],
        },
    },
    {
        name: 'grep',
        description: 'Alias for search_in_files. Search for a text pattern across files in a directory.',
        input_schema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Text or regex pattern to search for' },
                directory: { type: 'string', description: 'Directory to search in' },
                extension: { type: 'string', description: 'File extension filter (e.g. .ts, .py)' },
            },
            required: ['pattern', 'directory'],
        },
    },
    {
        name: 'ls',
        description: 'Alias for list_dir. List the contents of a directory.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Directory path' },
                recursive: { type: 'boolean', description: 'Include subdirectories (default: false)' },
            },
            required: ['path'],
        },
    },
    {
        name: 'cat',
        description: 'Alias for read_file. Read the contents of a file.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path' },
                start_line: { type: 'number', description: 'Start line' },
                end_line: { type: 'number', description: 'End line' },
            },
            required: ['path'],
        },
    },
    {
        name: 'mkdir',
        description: 'Create a new directory (including parents).',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Directory path to create' },
            },
            required: ['path'],
        },
    },
    {
        name: 'smoke_test',
        description: 'Run HTTP health checks against one or more endpoints.',
        input_schema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Base URL to test' },
                routes: { type: 'array', items: { type: 'string' }, description: 'Routes to check (default: ["/"])' },
                expected_status: { type: 'number', description: 'Expected HTTP status code' },
                expected_body: { type: 'string', description: 'String that must appear in the response body' },
                max_ms: { type: 'number', description: 'Maximum allowed response time (ms)' },
            },
            required: ['url'],
        },
    },
    {
        name: 'browser_action',
        description: 'Browser automation via Playwright: navigate, click, fill forms, take screenshots, extract text.',
        input_schema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Starting URL' },
                actions: {
                    type: 'array',
                    description: 'Sequence of browser actions to perform',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['click', 'fill', 'screenshot', 'wait', 'getText', 'getHtml', 'evaluate', 'scroll', 'waitForSelector'] },
                            selector: { type: 'string' },
                            value: { type: 'string' },
                            code: { type: 'string' },
                            timeout: { type: 'number' },
                        },
                        required: ['type'],
                    },
                },
                headless: { type: 'boolean', description: 'Run headless (default: true)' },
            },
            required: ['url', 'actions'],
        },
    },
    {
        name: 'web_search',
        description: 'Search the web using DuckDuckGo and optionally crawl GitHub or StackOverflow for up-to-date information.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                source: { type: 'string', enum: ['web', 'github', 'stackoverflow', 'all'], description: 'Where to search (default: web)' },
                max_results: { type: 'number', description: 'Max results per source (default: 8)' },
                crawl_top: { type: 'number', description: 'Fetch full page content from top N results (default: 0)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'crawl_url',
        description: 'Fetch and extract readable text content from any URL (GitHub repo, StackOverflow answer, docs page, etc.).',
        input_schema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to crawl' },
                max_chars: { type: 'number', description: 'Max characters to return (default: 4000)' },
            },
            required: ['url'],
        },
    },
    {
        name: 'vision_analyze',
        description: 'Take a screenshot of a URL and analyze it with a vision model. Detects UI bugs, layout issues, accessibility problems. Supports any OpenAI-compatible vision endpoint.',
        input_schema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Web page URL to screenshot and analyze' },
                image_path: { type: 'string', description: 'Path to an existing image file' },
                prompt: { type: 'string', description: 'Custom question or instruction for the vision model' },
                full_page: { type: 'boolean', description: 'Capture full page (default: false)' },
                provider: { type: 'string', enum: ['claude', 'openai'], description: 'Vision provider (default: claude)' },
                model: { type: 'string', description: 'Model name override (e.g. gpt-4o, claude-opus-4-6)' },
                api_key: { type: 'string', description: 'API key override (uses config key by default)' },
                api_url: { type: 'string', description: 'Custom OpenAI-compatible endpoint URL (e.g. http://localhost:8080/v1)' },
            },
        },
    },
];
// ─── Güvenlik sabitleri ──────────────────────────────────────────────────────
/** Proje kök dizini (deha-cli dizini) — shell komutları buradan dışarı çıkamaz */
var PROJECT_ROOT = path.resolve(__dirname, '../..');
/** İzin verilmeyen yıkıcı komut kalıpları */
var DANGEROUS_COMMANDS = [
    /^rm\s+-rf\s+\//, // rm -rf /
    /^rm\s+-rf\s+~/, // rm -rf ~
    /^rm\s+-rf\s+\*/, // rm -rf *
    /^rm\s+-rf\s+--no-preserve-root/,
    /^dd\s+if=/, // dd if=/dev/zero...
    /^mkfs\./, // mkfs.ext4, mkfs.btrfs
    /^fdisk\s/, // fdisk
    /^format\s/, // Windows format
    /^del\s+\/f\s+\/s\s+/, // Windows force recursive delete
    /^rd\s+\/s\s+\/q\s+/, // Windows force remove directory
    /^shutdown\s/, // shutdown /s /r
    /^reboot\s?$/,
    /^init\s+0/, // Linux shutdown
    /^halt\s?$/,
    /^poweroff\s?$/,
    /^>\/dev\/sda/, // direct disk write
    /^chmod\s+-R\s+0\s+\//, // chmod 0 /
    /^:\(\)\s*\{/, // fork bomb
];
/** Maksimum komut uzunluğu (karakter) */
var MAX_COMMAND_LENGTH = 2000;
/** Varsayılan timeout (ms) */
var DEFAULT_TIMEOUT_MS = 30000;
/** Maksimum timeout (ms) — 5 dakika */
var MAX_TIMEOUT_MS = 300000;
// Sync toollar
function executeTool(name, input) {
    var inp = input;
    try {
        switch (name) {
            case 'read_file':
            case 'cat': return toolReadFile(inp);
            case 'write_file': return toolWriteFile(inp);
            case 'edit_file': return (0, edit_1.editFile)(inp);
            case 'insert_lines': return (0, edit_1.insertLines)(inp);
            case 'delete_lines': return (0, edit_1.deleteLines)(inp);
            case 'list_dir':
            case 'ls': return toolListDir(inp);
            case 'search_in_files':
            case 'grep': return toolSearchInFiles(inp);
            case 'mkdir': return toolMkdir(inp);
            // Async toollar için placeholder — agent.ts'te executeToolAsync kullanılır
            case 'run_terminal':
            case 'run_python':
            case 'smoke_test':
            case 'browser_action':
            case 'vision_analyze':
            case 'web_search':
            case 'crawl_url':
            case 'run_shell':
                return "__ASYNC_TOOL__:".concat(name);
            default: return "Bilinmeyen tool: ".concat(name);
        }
    }
    catch (err) {
        return "HATA: ".concat(err instanceof Error ? err.message : String(err));
    }
}
// Async toollar
function executeToolAsync(name, input, config) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, toolVisionAnalyze, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 20, , 21]);
                    _a = name;
                    switch (_a) {
                        case 'run_shell': return [3 /*break*/, 1];
                        case 'run_terminal': return [3 /*break*/, 3];
                        case 'run_python': return [3 /*break*/, 5];
                        case 'smoke_test': return [3 /*break*/, 7];
                        case 'browser_action': return [3 /*break*/, 9];
                        case 'vision_analyze': return [3 /*break*/, 11];
                        case 'web_search': return [3 /*break*/, 14];
                        case 'crawl_url': return [3 /*break*/, 16];
                    }
                    return [3 /*break*/, 18];
                case 1: return [4 /*yield*/, toolRunShell(input)];
                case 2: return [2 /*return*/, _b.sent()];
                case 3: return [4 /*yield*/, (0, terminal_1.toolRunTerminal)(input)];
                case 4: return [2 /*return*/, _b.sent()];
                case 5: return [4 /*yield*/, (0, python_1.toolRunPython)(input)];
                case 6: return [2 /*return*/, _b.sent()];
                case 7: return [4 /*yield*/, (0, smoke_1.toolSmokeTest)(input)];
                case 8: return [2 /*return*/, _b.sent()];
                case 9: return [4 /*yield*/, (0, browser_1.toolBrowserAction)(input)];
                case 10: return [2 /*return*/, _b.sent()];
                case 11:
                    if (!config)
                        return [2 /*return*/, 'vision_analyze için config gerekli'];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./vision'); })];
                case 12:
                    toolVisionAnalyze = (_b.sent()).toolVisionAnalyze;
                    return [4 /*yield*/, toolVisionAnalyze(input, config)];
                case 13: return [2 /*return*/, _b.sent()];
                case 14: return [4 /*yield*/, (0, search_1.toolWebSearch)(input)];
                case 15: return [2 /*return*/, _b.sent()];
                case 16: return [4 /*yield*/, (0, search_1.toolCrawlUrl)(input)];
                case 17: return [2 /*return*/, _b.sent()];
                case 18: return [2 /*return*/, executeTool(name, input)];
                case 19: return [3 /*break*/, 21];
                case 20:
                    err_1 = _b.sent();
                    return [2 /*return*/, "HATA: ".concat(err_1 instanceof Error ? err_1.message : String(err_1))];
                case 21: return [2 /*return*/];
            }
        });
    });
}
// ─── Araç görsel logu ──────────────────────────────────────────────────────
function printToolCall(name, input) {
    var _a;
    var icons = {
        read_file: '📄',
        cat: '📄',
        write_file: '✏️ ',
        edit_file: '🖊️ ',
        insert_lines: '➕',
        delete_lines: '🗑️ ',
        list_dir: '📁',
        ls: '📁',
        mkdir: '📁',
        run_shell: '⚡',
        run_terminal: '💻',
        run_python: '🐍',
        smoke_test: '🧪',
        browser_action: '🌐',
        vision_analyze: '👁️ ',
        search_in_files: '🔍',
        grep: '🔍',
        web_search: '🌍',
        crawl_url: '🕷️ ',
    };
    var icon = (_a = icons[name]) !== null && _a !== void 0 ? _a : '🔧';
    var preview = Object.entries(input)
        .slice(0, 2)
        .map(function (_a) {
        var k = _a[0], v = _a[1];
        return "".concat(k, "=").concat(JSON.stringify(v).slice(0, 40));
    })
        .join(', ');
    logger_1.logger.write(chalk_1.default.dim("\n  ".concat(icon, " ")) + chalk_1.default.yellow(name) + chalk_1.default.dim("(".concat(preview, ")")));
}
// ─── Araç implementasyonları ───────────────────────────────────────────────
function toolReadFile(inp) {
    var _a, _b;
    if (!inp.path)
        throw new Error('path gerekli');
    var resolved = path.resolve(inp.path);
    var raw = fs.readFileSync(resolved, 'utf-8');
    var lines = raw.split('\n');
    var start = ((_a = inp.start_line) !== null && _a !== void 0 ? _a : 1) - 1;
    var end = (_b = inp.end_line) !== null && _b !== void 0 ? _b : lines.length;
    var sliced = lines.slice(start, end);
    var numbered = sliced.map(function (l, i) { return "".concat(start + i + 1, ": ").concat(l); }).join('\n');
    return "[".concat(resolved, "]\n").concat(numbered);
}
function toolWriteFile(inp) {
    if (!inp.path || inp.content === undefined)
        throw new Error('path ve content gerekli');
    var resolved = path.resolve(inp.path);
    var dir = path.dirname(resolved);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, inp.content, 'utf-8');
    return "Dosya yaz\u0131ld\u0131: ".concat(resolved, " (").concat(inp.content.length, " karakter)");
}
function toolListDir(inp) {
    if (!inp.path)
        throw new Error('path gerekli');
    var resolved = path.resolve(inp.path);
    if (inp.recursive) {
        return listRecursive(resolved, resolved, 0, 4);
    }
    var entries = fs.readdirSync(resolved, { withFileTypes: true });
    var lines = entries.map(function (e) {
        var isDir = e.isDirectory();
        return "".concat(isDir ? '📁' : '📄', " ").concat(e.name).concat(isDir ? '/' : '');
    });
    return "[".concat(resolved, "]\n").concat(lines.join('\n'));
}
function toolMkdir(inp) {
    if (!inp.path)
        throw new Error('path gerekli');
    var resolved = path.resolve(inp.path);
    if (fs.existsSync(resolved))
        return "Dizin zaten mevcut: ".concat(resolved);
    fs.mkdirSync(resolved, { recursive: true });
    return "Dizin olu\u015Fturuldu: ".concat(resolved);
}
function listRecursive(base, dir, depth, maxDepth) {
    if (depth > maxDepth)
        return '';
    var indent = '  '.repeat(depth);
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    var lines = [];
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var e = entries_1[_i];
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist')
            continue;
        var isDir = e.isDirectory();
        lines.push("".concat(indent).concat(isDir ? '📁' : '📄', " ").concat(e.name));
        if (isDir) {
            lines.push(listRecursive(base, path.join(dir, e.name), depth + 1, maxDepth));
        }
    }
    return lines.filter(Boolean).join('\n');
}
// Tehlikeli/yıkıcı komut kalıpları — agent asla bunları çalıştıramaz
var autoAllowDangerousCommands = false;
var FORBIDDEN_PATTERNS = [
    /(\|\s*)?rm\s+(-rf?\s+)?(\/(\s|$)|\/\*|~(\s|$)|\$HOME|\$PWD|\.\s*$)/i,
    /(\|\s*)?dd\s+if=/i,
    /(\|\s*)?mkfs\b/i,
    /(\|\s*)?fdisk\b/i,
    /(\|\s*)?\bformat\s+/i,
    /(\|\s*)?sudo\s+(rm|dd|mkfs|fdisk|format|shutdown|reboot|poweroff|init)/i,
    /(\|\s*)?chmod\s+777\s+\//i,
    /(\|\s*)?chown\s/i,
    /(\|\s*)?>(\s*\/dev\/(sda|sdb|sdc|nvme|mmc))/i,
    /(\|\s*)?shred/i,
    /(\|\s*)?:\(\)\s*\{.*(:|;).*\};/i, // fork bomb
    /(\|\s*)?wget\s+-O\s+\/dev\/null/i,
    /(\|\s*)?shutdown\s/i,
    /(\|\s*)?reboot\s?$/i,
    /(\|\s*)?poweroff\s?$/i,
    /(\|\s*)?halt\s?$/i,
];
function isSafeCommand(command) {
    // Maksimum komut uzunluğu
    if (command.length > 2000) {
        return { safe: false, reason: "Komut \u00E7ok uzun (".concat(command.length, " karakter, maks. 2000)") };
    }
    for (var _i = 0, FORBIDDEN_PATTERNS_1 = FORBIDDEN_PATTERNS; _i < FORBIDDEN_PATTERNS_1.length; _i++) {
        var pattern = FORBIDDEN_PATTERNS_1[_i];
        if (pattern.test(command)) {
            return { safe: false, reason: "G\u00FCvenlik nedeniyle engellendi: \"".concat(pattern, "\" ile e\u015Fle\u015Fen komut") };
        }
    }
    return { safe: true };
}
function toolRunShell(inp) {
    return __awaiter(this, void 0, void 0, function () {
        var check, inquirer, action, projectRoot, cwd, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!inp.command)
                        throw new Error('command gerekli');
                    check = isSafeCommand(inp.command);
                    if (!!check.safe) return [3 /*break*/, 3];
                    if (!!autoAllowDangerousCommands) return [3 /*break*/, 3];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('inquirer'); }).then(function (m) { return m.default || m; })];
                case 1:
                    inquirer = _b.sent();
                    return [4 /*yield*/, inquirer.prompt([
                            {
                                type: 'list',
                                name: 'action',
                                message: chalk_1.default.yellow("\n\u26A0\uFE0F TEHL\u0130KEL\u0130 KOMUT TESP\u0130T ED\u0130LD\u0130:\n") +
                                    chalk_1.default.white("   Komut: ") + chalk_1.default.cyan(inp.command) + '\n' +
                                    chalk_1.default.white("   Sebep: ") + chalk_1.default.red(check.reason) + '\n\n' +
                                    chalk_1.default.bold('Bu komutu çalıştırmak istiyor musunuz?'),
                                choices: [
                                    { name: '❌ İptal Et (Agent\'a hata dön)', value: 'cancel' },
                                    { name: '✅ Sadece bu seferlik izin ver', value: 'once' },
                                    { name: '🔥 Bu oturum boyunca HER ŞEYE izin ver (Bir daha sorma)', value: 'always' },
                                ],
                            }
                        ])];
                case 2:
                    action = (_b.sent()).action;
                    if (action === 'cancel') {
                        throw new Error("\u274C Kullan\u0131c\u0131 g\u00FCvenlik nedeniyle bu komutu reddetti.\nAgent shell komutlar\u0131 s\u0131n\u0131rl\u0131d\u0131r. Dosya i\u015Flemleri i\u00E7in write_file/edit_file/read_file tool'lar\u0131n\u0131 kullan\u0131n.");
                    }
                    else if (action === 'always') {
                        autoAllowDangerousCommands = true;
                    }
                    _b.label = 3;
                case 3:
                    projectRoot = process.cwd();
                    cwd = inp.cwd ? path.resolve(inp.cwd) : projectRoot;
                    // Proje dışına çıkışı engelle
                    if (!cwd.startsWith(projectRoot)) {
                        throw new Error("\u274C \u00C7al\u0131\u015Fma dizini proje d\u0131\u015F\u0131na \u00E7\u0131kamaz: ".concat(cwd, "\nProje k\u00F6k\u00FC: ").concat(projectRoot));
                    }
                    result = (0, child_process_1.execSync)(inp.command, {
                        cwd: cwd,
                        timeout: Math.min((_a = inp.timeout) !== null && _a !== void 0 ? _a : 30, 60) * 1000, // max 60 saniye
                        encoding: 'utf-8',
                        stdio: ['pipe', 'pipe', 'pipe'],
                        maxBuffer: 10 * 1024 * 1024, // 10MB
                    });
                    return [2 /*return*/, result || '(çıktı yok)'];
            }
        });
    });
}
function toolSearchInFiles(inp) {
    if (!inp.pattern || !inp.directory)
        throw new Error('pattern ve directory gerekli');
    var resolved = path.resolve(inp.directory);
    var results = [];
    if (!fs.existsSync(resolved)) {
        throw new Error("Yol bulunamad\u0131: ".concat(resolved));
    }
    var stats = fs.statSync(resolved);
    if (stats.isFile()) {
        searchFile(resolved, inp.pattern, inp.extension, results);
    }
    else {
        searchDir(resolved, inp.pattern, inp.extension, results, 0, 5);
    }
    if (results.length === 0)
        return 'Eşleşme bulunamadı.';
    return results.slice(0, 50).join('\n');
}
function searchDir(dir, pattern, ext, results, depth, maxDepth) {
    if (depth > maxDepth || results.length >= 50)
        return;
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var _i = 0, entries_2 = entries; _i < entries_2.length; _i++) {
        var e = entries_2[_i];
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist')
            continue;
        var full = path.join(dir, e.name);
        if (e.isDirectory()) {
            searchDir(full, pattern, ext, results, depth + 1, maxDepth);
        }
        else {
            searchFile(full, pattern, ext, results);
        }
    }
}
function searchFile(filePath, pattern, ext, results) {
    if (results.length >= 50)
        return;
    if (ext && !filePath.endsWith(ext))
        return;
    var regex = new RegExp(pattern, 'gi');
    try {
        var content = fs.readFileSync(filePath, 'utf-8');
        var lines = content.split('\n');
        lines.forEach(function (line, i) {
            regex.lastIndex = 0;
            if (regex.test(line)) {
                results.push("".concat(filePath, ":").concat(i + 1, ": ").concat(line.trim()));
            }
        });
    }
    catch (_a) {
        /* skip binary or unreadable files */
    }
}
