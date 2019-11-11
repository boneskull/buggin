const buggin = require('../../../src');

process.on('uncaughtException', () => {
  console.error('should appear after buggin output');
});

buggin(module, {force: true});

throw new Error('foo');
