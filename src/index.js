const path = require('path');
const fs = require('fs');
const emoji = require('node-emoji');
const color = require('ansi-colors');
const {sync: readPkg} = require('read-pkg');
const {stderr: supportsColor} = require('supports-color');

const kBuggin = Symbol('buggin');
const kBugginListener = Symbol('buggin-listener');
const bugginPkg = readPkg({cwd: path.join(__dirname, '..')});

const EVENT_UNCAUGHT_EXCEPTION = 'uncaughtException';
const EVENT_UNHANDLED_REJECTION = 'unhandledRejection';
/**
 * Returns `true` if there have been any non-buggin listeners added to our process events
 */
const hasNonBugginEventListeners = () =>
  process
    .listeners(EVENT_UNCAUGHT_EXCEPTION)
    .some(listener => !listener[kBugginListener]) ||
  process
    .listeners(EVENT_UNHANDLED_REJECTION)
    .some(listener => !listener[kBugginListener]);

const install = () => {
  if (global[kBuggin]) {
    return global[kBuggin];
  }
  const buggin = Object.create(null);
  buggin.listenerStack = [];
  buggin.config = Object.create(null);
  Object.freeze(buggin);
  return buggin;
};

/**
 * @param {string} url
 * @param {Error} err
 */
const buildUrl = (url, err) => {
  const {stringify} = require('querystring');
  const title = `[buggin] Uncaught exception encountered: ${err.message}`;
  const body = `[buggin](${bugginPkg.homepage}) asked me to report this uncaught exception:
\n
\`\`\`
${err.stack}
\`\`\`
\n
This is what I was doing when it happened:

<!-- Bug reporter: please describe! -->
`;
  return `${url}/new?${stringify({title, body})}`;
};

/**
 *
 * @param {any} value
 * @returns {value is Error}
 */
const isError = value =>
  value && typeof value === 'object' && typeof value.stack === 'string';

const buggin = install();

/**
 *
 * @param {string} name
 * @param {string} url
 * @param {string} root
 * @returns {NodeJS.UncaughtExceptionListener|NodeJS.UnhandledRejectionListener}
 */
const createUncaughtExceptionListener = (name, url, root) => {
  const rootRegExp = new RegExp(`${String(root)}(?!node_modules)`);
  const useLink = require('supports-hyperlinks').stderr;
  /**
   * @type {NodeJS.UncaughtExceptionListener|NodeJS.UnhandledRejectionListener}
   * @todo the NodeJS.UncaughtExceptionListener type is incorrect and omits the
   * second parameter, `origin`, which is going to be "uncaughtException" in
   * this case.
   */
  const listener = (err, origin) => {
    if (isError(err) && rootRegExp.test(err.stack)) {
      // @ts-ignore
      const isPromise = origin && origin !== 'uncaughtException';
      color.enabled = supportsColor;
      let linkString;
      if (useLink) {
        const {link} = require('ansi-escapes');
        linkString = link(`${url}`, buildUrl(url, err));
      } else {
        linkString = buildUrl(url, err);
      }
      let output = `${color.blackBright('- - - - - - - - - - - - - - - - - -')}

${emoji.get('exclamation')} The following ${color.bold(
        isPromise ? 'unhandled rejection' : 'uncaught exception'
      )} is likely a bug in ${color.yellow(name)}.
${color.italic('Please')} report the issue at: ${linkString}

Thanks! ${emoji.get('heart')}

  -- ${color.yellow(name)} maintainers

${color.blackBright('- - - - - - - - - - - - - - - - - -')}

`;
      if (!supportsColor) {
        output = emoji.strip(output);
      }
      fs.writeSync(
        // @ts-ignore
        process.stderr.fd,
        output
      );
    }
    setup.disable();
    if (!hasNonBugginEventListeners()) {
      process.nextTick(() => {
        throw err; // node-do-not-add-exception-line
      });
    }
  };
  listener[kBugginListener] = true;
  return listener;
};

const flushListenerStack = () => {
  do {
    const name = buggin.listenerStack.pop();
    const {url, root} = buggin.config[name];
    process.prependOnceListener(
      EVENT_UNCAUGHT_EXCEPTION,
      /**
       * @type {NodeJS.UncaughtExceptionListener}
       */
      (createUncaughtExceptionListener(name, url, root))
    );
    process.prependOnceListener(
      EVENT_UNHANDLED_REJECTION,
      createUncaughtExceptionListener(name, url, root)
    );
    delete buggin.config[name];
  } while (buggin.listenerStack.length);
};

/**
 * @param {string} cwd
 */
const readPackage = cwd => {
  const {sync: findUp} = require('find-up');

  const pkgPath = findUp('package.json', {cwd});
  if (pkgPath) {
    const pkg = readPkg({cwd: path.dirname(pkgPath)});
    return {pkgPath: path.dirname(pkgPath), pkg: normalize(pkg)};
  }
  return {};
};

/**
 * @param {any} value
 * @returns {value is NodeJS.Module}
 */
const isModule = value => value instanceof require('module');

/**
 * @param {object} pkg
 * @returns {import('normalize-package-data').Package}
 */
const normalize = pkg => {
  require('normalize-package-data')(pkg);
  return pkg;
};

/**
 *
 * @param {NodeJS.Module|string} [entryPoint]
 */
const findEntryPoint = entryPoint => {
  if (findEntryPoint.cached) {
    return findEntryPoint.cached;
  }
  if (isModule(entryPoint)) {
    entryPoint = entryPoint.filename;
  }
  if (!entryPoint) {
    // @ts-ignore
    let parent = module.parent;
    while (parent !== null) {
      parent = parent.parent;
    }
    entryPoint = parent.filename;
  }
  return (findEntryPoint.cached = entryPoint);
};
findEntryPoint.cached = undefined;

/**
 * Configures buggin for a module.
 * "This function has high cyclomatic complexity"
 * @param {string|import('type-fest').PackageJson|NodeJS.Module} [pkgValue]
 * @param {Partial<SetupOptions>} [opts]
 */
const setup = (pkgValue, {force = false, name = '', entryPoint} = {}) => {
  /**
   * @type {string}
   */
  let url;

  /**
   * @type {Partial<PackageInfo>}
   */
  let pkgInfo;

  if (!pkgValue) {
    pkgInfo = readPackage(findEntryPoint());
  } else if (typeof pkgValue === 'string') {
    if (pkgValue.startsWith('http')) {
      url = pkgValue;
    } else if (require('is-email-like')(pkgValue)) {
      url = `mailto:${pkgValue}`;
    }
    pkgInfo = readPackage(url ? findEntryPoint(entryPoint) : pkgValue);
  } else if (isModule(pkgValue)) {
    pkgInfo = readPackage(
      entryPoint ? findEntryPoint(entryPoint) : pkgValue.filename
    );
  } else if (
    typeof pkgValue === 'object' &&
    (pkgValue.bugs || pkgValue.repository)
  ) {
    if (typeof entryPoint !== 'string') {
      throw new TypeError(
        `If provding a parsed package.json object, the "entryPoint" option must be a path to the package root directory.`
      );
    }
    pkgInfo = {pkg: normalize(pkgValue), pkgPath: entryPoint};
  } else {
    const {inspect} = require('util');
    throw new TypeError(`Invalid value passed to buggin: ${inspect(pkgValue)}`);
  }
  const {pkg, pkgPath} = pkgInfo;

  if (!pkg) {
    // TODO: probably warn user it didn't work
    return;
  }

  url = String(
    url || pkg.bugs.url || (pkg.bugs.email && `mailto:${bugginPkg.bugs.email}`)
  );

  const pkgName = String(name || (pkg && pkg.name));

  buggin.config[pkgName] = {url, root: pkgPath};

  if (!force && hasNonBugginEventListeners()) {
    // we can't just throw out of here, since an uncaught exception listener already
    // exists.  I mean, I suppose we COULD, but there's much less of a guarantee that this
    // message would get to the developer.
    const err = new Error(`process Event listeners already exist which were not added by buggin. This might cause unexpected behavior.
Pass option \`{force: true}\` to \`buggin()\` to add listeners anyway.
`);
    fs.writeSync(
      // @ts-ignore
      process.stderr.fd,
      err.stack
    );
    process.exit(1);
  }

  buggin.listenerStack.push(...Object.keys(buggin.config));
  flushListenerStack();
};

/**
 * Remove all buggin listeners
 */
setup.disable = () => {
  process
    .listeners(EVENT_UNCAUGHT_EXCEPTION)
    .filter(listener => listener[kBugginListener])
    .forEach(listener => {
      process.removeListener(EVENT_UNCAUGHT_EXCEPTION, listener);
    });
  process
    .listeners(EVENT_UNHANDLED_REJECTION)
    .filter(listener => listener[kBugginListener])
    .forEach(listener => {
      process.removeListener(EVENT_UNHANDLED_REJECTION, listener);
    });
};

module.exports = setup;
setup.buggin = setup;

/**
 * @typedef {Object} SetupOptions
 * @property {boolean} force
 * @property {string} name
 * @property {string|NodeJS.Module} entryPoint - A path to a package's root directory or a Module
 */

/**
 * @typedef {Object} PackageInfo
 * @property {string} pkgPath - Path to package.json
 * @property {import('normalize-package-data').Package} pkg - package.json contents
 */
