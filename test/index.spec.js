const unexpected = require('unexpected');
const expect = unexpected.clone().use(require('unexpected-sinon'));
const execa = require('execa');

describe('buggin', function() {
  it('should display message upon uncaught exception thrown from async code', async function() {
    return expect(
      execa(process.execPath, [require.resolve('./fixture/async')]),
      'to be rejected with error satisfying',
      {stderr: /The following exception is likely a bug/}
    );
  });
});
