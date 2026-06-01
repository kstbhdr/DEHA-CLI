#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var dotenv = require("dotenv");
// Always load .env from the package directory, regardless of where `deha` is run from
dotenv.config({ path: path.resolve(__dirname, '../.env') });
var chalk_1 = require("chalk");
var cli_1 = require("./cli");
var logger_1 = require("./services/logger");
var cli = new cli_1.DehaCLI();
cli.run().catch(function (err) {
    var message = err instanceof Error ? err.message : String(err);
    logger_1.logger.error(chalk_1.default.red('\n✗ DEHA Hata: ') + message + '\n');
    process.exit(1);
});
