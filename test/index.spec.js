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
});
