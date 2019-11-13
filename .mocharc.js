'use strict';

module.exports = {
  'forbid-only': Boolean(process.env.CI),
  timeout: 2000,
  slow: 1000
};
