// Starts the bot. The bot shares code with the War Room app in ../src, so
// this makes those files find their packages (mongodb, web-push) in this
// folder's node_modules, and runs TypeScript directly with tsx.
const path = require("path");
const Module = require("module");

process.env.NODE_PATH = [path.join(__dirname, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
process.env.TSX_TSCONFIG_PATH = path.join(__dirname, "tsconfig.json");

require("tsx/cjs");
require("./src/index.ts");
