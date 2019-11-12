'use strict';

module.exports = {
  'forbid-only': Boolean(process.env.CI),
  timeout: 1000,
  slow: 500
};
