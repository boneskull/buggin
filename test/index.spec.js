const unexpected = require('unexpected');
const expect = unexpected.clone().use(require('unexpected-sinon'));
const execa = require('execa');
const {sync: readPkg} = require('read-pkg');
const path = require('path');
const nodeVersion = require('node-version');

const NODE_MAJOR_VERSION = parseInt(nodeVersion.major, 10);

const {name: PACKAGE_A_NAME} = readPkg({
  cwd: path.join(__dirname, 'fixture', 'package-a')
});
const {name: PACKAGE_B_NAME} = readPkg({
  cwd: path.join(__dirname, 'fixture', 'package-b')
});

/**
 * Run a fixture
 * @param {string} relativePath
 * @param {import('execa').SyncOptions} [opts]
 */
const run = (relativePath, opts = {}) =>
  execa(process.execPath, [require.resolve(relativePath)], opts);

describe('buggin', function() {
  describe('when uncaught exception thrown from a script', function() {
    describe('when the exception is thrown asynchronously', function() {
      it('should display message and exit with code 1', async function() {
        return expect(
          run('./fixture/package-a/async'),
          'to be rejected with error satisfying',
          {
            stderr: expect
              .it(
                'to match',
                new RegExp(
                  `The following uncaught exception is likely a bug in ${PACKAGE_A_NAME}`
                )
              )
              .and('to match', /Error: async/),
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
            stderr: expect
              .it(
                'to match',
                new RegExp(
                  `The following uncaught exception is likely a bug in ${PACKAGE_A_NAME}`
                )
              )
              .and('to match', /Error: sync/),
            exitCode: 1
          }
        );
      });
    });

    describe('when the error is from an unhandled rejection', function() {
      describe('when using default Node.js behavior', function() {
        it('should display message and exit with code 0', async function() {
          return expect(
            run('./fixture/package-a/promise'),
            'to be fulfilled with value satisfying',
            {
              stderr: expect
                .it(
                  'to match',
                  new RegExp(
                    `The following unhandled rejection is likely a bug in ${PACKAGE_A_NAME}`
                  )
                )
                .and(
                  'to match',
                  /UnhandledPromiseRejectionWarning: Error: promise/
                )
            }
          );
        });
      });

      describe('when "warn on unhandled rejections" mode used', function() {
        before(function() {
          if (NODE_MAJOR_VERSION < 12) {
            this.skip();
          }
        });

        it('should display message and exit with code 0', async function() {
          return expect(
            run('./fixture/package-a/promise', {
              env: {NODE_OPTIONS: '--unhandled-rejections=warn'}
            }),
            'to be fulfilled with value satisfying',
            {
              stderr: expect
                .it(
                  'to match',
                  new RegExp(
                    `The following unhandled rejection is likely a bug in ${PACKAGE_A_NAME}`
                  )
                )
                .and(
                  'to match',
                  /UnhandledPromiseRejectionWarning: Error: promise/
                )
            }
          );
        });
      });

      describe('when "strict unhandled rejection" mode used', function() {
        before(function() {
          if (NODE_MAJOR_VERSION < 12) {
            this.skip();
          }
        });

        it('should display message and exit with code 1', async function() {
          return expect(
            run('./fixture/package-a/promise', {
              env: {NODE_OPTIONS: '--unhandled-rejections=strict'}
            }),
            'to be rejected with error satisfying',
            {
              stderr: expect
                .it(
                  'to match',
                  new RegExp(
                    `The following unhandled rejection is likely a bug in ${PACKAGE_A_NAME}`
                  )
                )
                .and('to match', /Error: promise/),
              exitCode: 1
            }
          );
        });
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
            stderr: /should appear after buggin output$/
          }
        );
      });
    });
  });

  describe('when multiple buggin listeners are registered', function() {
    describe('when package A installs buggin before package B and package B throws', function() {
      it('should display a message from package B', async function() {
        return expect(
          run('./fixture/package-b/use-package-a-before'),
          'to be rejected with error satisfying',
          {
            stderr: expect
              .it(
                'to match',
                new RegExp(
                  `The following uncaught exception is likely a bug in ${PACKAGE_B_NAME}`
                )
              )
              .and('to match', /Error: package-b-sync/)
              .and(
                'not to match',
                new RegExp(
                  `The following uncaught exception is likely a bug in ${PACKAGE_A_NAME}`
                )
              ),
            exitCode: 1
          }
        );
      });
    });

    describe('when package B installs buggin before package A and package A throws', function() {
      it('should display a message from package A', async function() {
        return expect(
          run('./fixture/package-b/use-package-a-after'),
          'to be rejected with error satisfying',
          {
            stderr: expect
              .it(
                'to match',
                new RegExp(
                  `The following uncaught exception is likely a bug in ${PACKAGE_A_NAME}`
                )
              )
              .and('to match', /Error: sync/)
              .and(
                'not to match',
                new RegExp(
                  `The following uncaught exception is likely a bug in ${PACKAGE_B_NAME}`
                )
              ),
            exitCode: 1
          }
        );
      });
    });
  });

  describe('when exception is thrown from a non-buggin-using package', function() {
    it('should not display buggin message', async function() {
      return expect(
        run('./fixture/package-b/use-package-c'),
        'to be rejected with error satisfying',
        {
          stderr: expect.it(
            'not to match',
            new RegExp(/The following uncaught exception/)
          ),
          exitCode: 1
        }
      );
    });
  });
});
