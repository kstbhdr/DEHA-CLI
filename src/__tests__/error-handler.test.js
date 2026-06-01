"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var error_handler_1 = require("../services/error-handler");
(0, vitest_1.describe)('formatErrorMessage', function () {
    (0, vitest_1.it)('Error nesnesinden message alanını döndürür', function () {
        (0, vitest_1.expect)((0, error_handler_1.formatErrorMessage)(new Error('Bir hata oluştu'))).toBe('Bir hata oluştu');
    });
    (0, vitest_1.it)('string hataları olduğu gibi döndürür', function () {
        (0, vitest_1.expect)((0, error_handler_1.formatErrorMessage)('kritik hata')).toBe('kritik hata');
    });
    (0, vitest_1.it)('number hataları JSON.stringify ile döndürür', function () {
        (0, vitest_1.expect)((0, error_handler_1.formatErrorMessage)(42)).toBe('42');
    });
    (0, vitest_1.it)('object hataları JSON.stringify ile döndürür', function () {
        (0, vitest_1.expect)((0, error_handler_1.formatErrorMessage)({ code: 500, msg: 'Server Error' })).toBe('{"code":500,"msg":"Server Error"}');
    });
    (0, vitest_1.it)('null/undefined güvenli', function () {
        (0, vitest_1.expect)((0, error_handler_1.formatErrorMessage)(null)).toBe('null');
        (0, vitest_1.expect)((0, error_handler_1.formatErrorMessage)(undefined)).toBe(undefined);
    });
    (0, vitest_1.it)('Error alt sınıflarını da doğru işler', function () {
        var CustomError = /** @class */ (function (_super) {
            __extends(CustomError, _super);
            function CustomError() {
                return _super.call(this, 'Custom error msg') || this;
            }
            return CustomError;
        }(Error));
        (0, vitest_1.expect)((0, error_handler_1.formatErrorMessage)(new CustomError())).toBe('Custom error msg');
    });
});
(0, vitest_1.describe)('categorizeError', function () {
    (0, vitest_1.it)('network hatası kategorilendirir', function () {
        var result = (0, error_handler_1.categorizeError)(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
        (0, vitest_1.expect)(result.category).toBe('network');
        (0, vitest_1.expect)(result.suggestion).toContain('İnternet bağlantını');
    });
    (0, vitest_1.it)('auth hatası kategorilendirir', function () {
        var result = (0, error_handler_1.categorizeError)(new Error('401 Unauthorized - invalid API key'));
        (0, vitest_1.expect)(result.category).toBe('auth');
        (0, vitest_1.expect)(result.suggestion).toContain('API anahtarını');
    });
    (0, vitest_1.it)('api hatası kategorilendirir (rate limit)', function () {
        var result = (0, error_handler_1.categorizeError)(new Error('429 Too Many Requests - rate limit exceeded'));
        (0, vitest_1.expect)(result.category).toBe('api');
        (0, vitest_1.expect)(result.suggestion).toContain('API sağlayıcında');
    });
    (0, vitest_1.it)('validation hatası kategorilendirir', function () {
        var result = (0, error_handler_1.categorizeError)(new Error('422 Validation Error: name is required'));
        (0, vitest_1.expect)(result.category).toBe('validation');
    });
    (0, vitest_1.it)('system hatası kategorilendirir (ENOENT)', function () {
        var result = (0, error_handler_1.categorizeError)(new Error('ENOENT: no such file or directory'));
        (0, vitest_1.expect)(result.category).toBe('system');
    });
    (0, vitest_1.it)('string hata kategorilendirir', function () {
        var result = (0, error_handler_1.categorizeError)('timeout exceeded');
        (0, vitest_1.expect)(result.category).toBe('network');
    });
    (0, vitest_1.it)('bilinmeyen hata unknown kategorisine düşer', function () {
        var result = (0, error_handler_1.categorizeError)(new Error('bir şey oldu ama ne?'));
        (0, vitest_1.expect)(result.category).toBe('unknown');
    });
});
(0, vitest_1.describe)('formatUserError', function () {
    (0, vitest_1.it)('kullanıcı dostu hata mesajı formatlar', function () {
        var msg = (0, error_handler_1.formatUserError)(new Error('ECONNREFUSED'), 'test');
        (0, vitest_1.expect)(msg).toContain('BAĞLANTI HATASI');
        (0, vitest_1.expect)(msg).toContain('ECONNREFUSED');
        (0, vitest_1.expect)(msg).toContain('💡');
    });
    (0, vitest_1.it)('context eklenebilir', function () {
        var msg = (0, error_handler_1.formatUserError)(new Error('hata'), 'API çağrısı');
        (0, vitest_1.expect)(msg).toContain('API çağrısı');
    });
});
(0, vitest_1.describe)('handleError', function () {
    var exitSpy = vitest_1.vi.spyOn(process, 'exit').mockImplementation(function () { return undefined; });
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('hata mesajını loglar ve exit eder', function () {
        (0, error_handler_1.handleError)(new Error('test error'), 'ctx', { exit: true });
        (0, vitest_1.expect)(exitSpy).toHaveBeenCalledWith(1);
    });
    (0, vitest_1.it)('exit:false ile çıkış yapmaz', function () {
        (0, error_handler_1.handleError)(new Error('test error'), undefined, { exit: false });
        (0, vitest_1.expect)(exitSpy).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('özel exit code ile çıkabilir', function () {
        (0, error_handler_1.handleError)(new Error('test'), undefined, { exit: true, exitCode: 42 });
        (0, vitest_1.expect)(exitSpy).toHaveBeenCalledWith(42);
    });
});
