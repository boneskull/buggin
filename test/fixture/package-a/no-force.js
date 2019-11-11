const buggin = require('../../../src');

process.on('uncaughtException', ignored => {});

buggin(module);
