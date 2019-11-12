const buggin = require('../../../src');

buggin(module);

Promise.resolve().then(() => {
  throw new Error('promise');
});
