"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRepoMap = generateRepoMap;
var fs = require("fs");
var path = require("path");
function generateRepoMap(dir, options) {
    if (options === void 0) { options = {}; }
    var _a = options.maxDepth, maxDepth = _a === void 0 ? 3 : _a, _b = options.excludeDirs, excludeDirs = _b === void 0 ? ['node_modules', '.git', 'dist', '.deha'] : _b;
    if (!fs.existsSync(dir))
        return '';
    var lines = [];
    function walk(currentDir, depth) {
        if (depth > maxDepth)
            return;
        var items = fs.readdirSync(currentDir, { withFileTypes: true });
        // Sort: directories first, then files
        items.sort(function (a, b) {
            if (a.isDirectory() && !b.isDirectory())
                return -1;
            if (!a.isDirectory() && b.isDirectory())
                return 1;
            return a.name.localeCompare(b.name);
        });
        for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
            var item = items_1[_i];
            if (excludeDirs.includes(item.name))
                continue;
            var indent = '  '.repeat(depth);
            if (item.isDirectory()) {
                lines.push("".concat(indent, "\uD83D\uDCC1 ").concat(item.name, "/"));
                walk(path.join(currentDir, item.name), depth + 1);
            }
            else {
                // For files, maybe just show significant ones or just names
                var ext = path.extname(item.name);
                if (['.ts', '.js', '.md', '.json', '.py'].includes(ext)) {
                    lines.push("".concat(indent, "\uD83D\uDCC4 ").concat(item.name));
                }
            }
        }
    }
    lines.push("Project Root: ".concat(path.basename(dir)));
    walk(dir, 0);
    return lines.join('\n');
}
