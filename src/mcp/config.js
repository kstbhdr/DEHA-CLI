"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_SERVERS = void 0;
exports.getMcpConfigPath = getMcpConfigPath;
exports.readMcpConfig = readMcpConfig;
exports.writeMcpConfig = writeMcpConfig;
exports.addServer = addServer;
exports.removeServer = removeServer;
var fs = require("fs");
var path = require("path");
var os = require("os");
// Popüler MCP sunucuları kataloğu — /mcp install ile kurulabilir
exports.KNOWN_SERVERS = {
    filesystem: {
        description: 'Dosya sistemi okuma/yazma/listeleme',
        packages: ['@modelcontextprotocol/server-filesystem'],
        config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
            description: 'Dosya sistemi erişimi',
        },
    },
    fetch: {
        description: 'Web sayfası ve URL içeriği çekme',
        packages: ['@modelcontextprotocol/server-fetch'],
        config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-fetch'],
            description: 'HTTP fetch aracı',
        },
    },
    git: {
        description: 'Git repo okuma, log, diff, commit',
        packages: ['@modelcontextprotocol/server-git'],
        config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-git', '--repository', process.cwd()],
            description: 'Git işlemleri',
        },
    },
    github: {
        description: 'GitHub API — PR, issue, repo yönetimi',
        packages: ['@modelcontextprotocol/server-github'],
        config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'YOUR_TOKEN' },
            description: 'GitHub API erişimi',
        },
    },
    'brave-search': {
        description: 'Brave Search API ile web araması',
        packages: ['@modelcontextprotocol/server-brave-search'],
        config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
            env: { BRAVE_API_KEY: 'YOUR_KEY' },
            description: 'Web araması',
        },
    },
    puppeteer: {
        description: 'Tarayıcı otomasyonu, screenshot, scraping',
        packages: ['@modelcontextprotocol/server-puppeteer'],
        config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-puppeteer'],
            description: 'Browser automation',
        },
    },
    postgres: {
        description: 'PostgreSQL veritabanı sorguları',
        packages: ['@modelcontextprotocol/server-postgres'],
        config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
            description: 'PostgreSQL erişimi',
        },
    },
    sqlite: {
        description: 'SQLite veritabanı okuma/yazma',
        packages: ['@modelcontextprotocol/server-sqlite'],
        config: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './db.sqlite'],
            description: 'SQLite erişimi',
        },
    },
};
// ─── Config dosyası yönetimi ────────────────────────────────────────────────
function getMcpConfigPath() {
    var dir = path.join(os.homedir(), '.deha');
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'mcp.json');
}
function readMcpConfig() {
    var configPath = getMcpConfigPath();
    if (!fs.existsSync(configPath))
        return { servers: {} };
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    catch (_a) {
        return { servers: {} };
    }
}
function writeMcpConfig(config) {
    fs.writeFileSync(getMcpConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
function addServer(name, serverConfig) {
    var config = readMcpConfig();
    config.servers[name] = serverConfig;
    writeMcpConfig(config);
}
function removeServer(name) {
    var config = readMcpConfig();
    if (!config.servers[name])
        return false;
    delete config.servers[name];
    writeMcpConfig(config);
    return true;
}
