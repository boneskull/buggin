const unexpected = require('unexpected');
const expect = unexpected.clone().use(require('unexpected-sinon'));
const execa = require('execa');

/**
 * Run a fixture
 * @param {string} relativePath
 */
const run = relativePath =>
  execa(process.execPath, [require.resolve(relativePath)]);

describe('buggin', function() {
  describe('when uncaught exception thrown from a script', function() {
    describe('when the exception is thrown asynchronously', function() {
      it('should display message and exit with code 1', async function() {
        return expect(
          run('./fixture/package-a/async'),
          'to be rejected with error satisfying',
          {
            stderr: /The following uncaught exception is likely a bug in buggin-fixtures/,
            exitCode: 1
          }
        );
      });
    });

    describe('when the exception is thrown synchronously', function() {
      it('should display message and exit with code 1', async function() {
        return expect(
          run('./fixture/package-a/sync'),
          'to be rejected with error satisfying',
          {
            stderr: /The following uncaught exception is likely a bug in buggin-fixtures/,
            exitCode: 1
          }
        );
      });
    });

    describe('when the error is from an unhandled rejection', function() {
      it('should display message and exit with code 1', async function() {
        return expect(
          run('./fixture/package-a/promise'),
          'to be rejected with error satisfying',
          {
            stderr: /The following unhandled rejection is likely a bug in buggin-fixtures/,
            exitCode: 1
          }
        );
      });
    });
  });

  describe('when attempting to add a buggin to a process which already has pertinent event listeners', function() {
    describe('when `force` option is `false`', function() {
      it('should print error to console and exit immediately', function() {
        return expect(
          run('./fixture/package-a/no-force'),
          'to be rejected with error satisfying',
          {
            stderr: /already exist which were not added by buggin/,
            exitCode: 1
          }
        );
      });
    });

    describe('when `force` option is `true`', function() {
      it('should display message and allow existing listener to run', function() {
        return expect(
          run('./fixture/package-a/force'),
          'to be fulfilled with value satisfying',
          {
            stderr: /should appear after buggin output$/,
            exitCode: 0
          }
        );
      });
    });
  });
});
