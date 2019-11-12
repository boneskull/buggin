const buggin = require('../../../src');

buggin(module);

setTimeout(() => {
  throw new Error('async');
}, 50);
