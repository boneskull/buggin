const buggin = require('../../../src');

buggin(module);

setTimeout(() => {
  throw new Error('foo');
}, 50);
