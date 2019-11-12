// for side-effects
require('../package-a/async');

const buggin = require('../../../src');
buggin(module);

throw new Error('package-b-sync');
