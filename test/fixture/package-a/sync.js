const buggin = require('../../../src');

buggin(module);

throw new Error('sync');
