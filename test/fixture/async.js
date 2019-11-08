const buggin = require('../..');

buggin(module);

setTimeout(() => {
  throw new Error('foo');
}, 50);
