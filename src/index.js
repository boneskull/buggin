const path = require('path');
const fs = require('fs');
const emoji = require('node-emoji');
const color = require('ansi-colors');
const {sync: readPkg} = require('read-pkg');
const kBuggin = Symbol('buggin');
const kBugginListener = Symbol('buggin-listener');

const bugginPkg = readPkg({cwd: path.join(__dirname, '..')});

const EVENT = 'uncaughtException';

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

const buggin = install();

/**
 *
 * @param {string} name
 * @param {string} url
 * @param {string} root
 * @returns {NodeJS.UncaughtExceptionListener}
 */
const createUncaughtExceptionListener = (name, url, root) => {
  const rootRegExp = new RegExp(`${String(root)}(?!node_modules)`);
  const useLink = require('supports-hyperlinks').stderr;
  /**
   * @type {NodeJS.UncaughtExceptionListener}
   */
  // @ts-ignore
  const listener = (err, origin) => {
    if (err && typeof err === 'object' && rootRegExp.test(err.stack)) {
      let linkString;
      if (useLink) {
        const {link} = require('ansi-escapes');
        linkString = link(`${url}`, buildUrl(url, err));
      } else {
        linkString = buildUrl(url, err);
      }
      fs.writeSync(
        // @ts-ignore
        process.stderr.fd,
        `${color.blackBright('- - - - - - - - - - - - - - - - - -')}

${emoji.get(
  'exclamation'
)} The following exception is likely a bug in ${color.yellow(name)}.
${color.italic('Please')} report the issue at: ${linkString}

Thanks! ${emoji.get('heart')}

  -- ${color.yellow(name)} maintainers

${color.blackBright('- - - - - - - - - - - - - - - - - -')}

`
      );
    }
    setup.disable();
    throw err;
  };
  listener[kBugginListener] = true;
  return listener;
};

const flushListenerStack = () => {
  do {
    const name = buggin.listenerStack.pop();
    const {url, root} = buggin.config[name];
    process.prependOnceListener(
      EVENT,
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
 * @param {string|import('type-fest').PackageJson|NodeJS.Module} pkgValue
 * @param {Partial<SetupOptions>} opts
 */
const setup = (pkgValue, {force = false, name = '', entryPoint} = {}) => {
  /**
   * @type {string?}
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
    // probably warn user it didn't work
    return;
  }

  url = String(
    url || pkg.bugs.url || (pkg.bugs.email && `mailto:${bugginPkg.bugs.email}`)
  );

  const pkgName = String(name || (pkg && pkg.name));

  buggin.config[pkgName] = {url, root: pkgPath};

  process.nextTick(enable);
};

const enable = () => {
  buggin.listenerStack.push(...Object.keys(buggin.config));
  flushListenerStack();
};

/**
 * Remove all listeners
 */
setup.disable = () => {
  process.listeners(EVENT).forEach(listener => {
    if (listener[kBugginListener]) {
      process.removeListener(EVENT, listener);
    }
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
