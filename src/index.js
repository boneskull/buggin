const path = require('path');
const fs = require('fs');
const emoji = require('node-emoji');
const color = require('ansi-colors');
const {sync: readPkg} = require('read-pkg');
const parentModule = require('parent-module');
const {stderr: supportsColor} = require('supports-color');
const {parse: parseStacktrace} = require('stacktrace-parser');

const kBuggin = Symbol('buggin');
const kBugginListener = Symbol('buggin-listener');
const bugginPkg = readPkg({cwd: path.join(__dirname, '..')});

const EVENT_UNCAUGHT_EXCEPTION = 'uncaughtException';
const EVENT_UNHANDLED_REJECTION = 'unhandledRejection';
/**
 * Returns `true` if there have been any non-buggin listeners added to our process events
 */
const hasNonBugginEventListeners = (
  events = [EVENT_UNCAUGHT_EXCEPTION, EVENT_UNHANDLED_REJECTION]
) => {
  let hasUncaughtExceptionListener = false;
  let hasUnhandledRejectionListener = false;
  if (events.includes(EVENT_UNCAUGHT_EXCEPTION)) {
    hasUncaughtExceptionListener = process
      .listeners(EVENT_UNCAUGHT_EXCEPTION)
      .some(listener => !listener[kBugginListener]);
  }
  if (events.includes(EVENT_UNHANDLED_REJECTION)) {
    hasUnhandledRejectionListener = process
      .listeners(EVENT_UNHANDLED_REJECTION)
      .some(listener => !listener[kBugginListener]);
  }
  return hasUncaughtExceptionListener || hasUnhandledRejectionListener;
};

/**
 * Factory which creates a function to test whether an Error originates from
 * the package at `root`.
 * @param {string} rootDirpath - Package root directory
 */
const createStackTraceTester = rootDirpath => {
  const rootRegExp = new RegExp(`${String(rootDirpath)}(?!node_modules)`);

  return /** @param {Error} err */ err => {
    const parsedStack = parseStacktrace(err.stack);
    const {file} = parsedStack.shift();
    return rootRegExp.test(file);
  };
};

/**
 * Creates buggin's global store, or returns a reference to it if it already exists.
 */
const install = () => {
  if (global[kBuggin]) {
    return global[kBuggin];
  }
  const buggin = Object.create(null);
  buggin.config = Object.create(null);
  Object.freeze(buggin);
  return buggin;
};

/**
 * Given a "new issue" URL and error, create a link for the user to click on, which
 * will pre-fill an issue.
 * @param {string} url - New issue URL
 * @param {Error} err - Error object
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
 * Returns `true` if `value` is an Error, or something close enough.
 * @param {any} value - Value to test
 * @returns {value is Error}
 */
const isError = value =>
  value && typeof value === 'object' && typeof value.stack === 'string';

const buggin = install();

/**
 * Creates a process listener for a particular event and package name.
 * @param {typeof EVENT_UNCAUGHT_EXCEPTION|typeof EVENT_UNHANDLED_REJECTION} event - Event name
 * @param {string} name - Package name
 * @param {string} url - "New issue" URL
 * @param {string} rootDirpath - Root dirpath of package
 * @returns {NodeJS.UncaughtExceptionListener|NodeJS.UnhandledRejectionListener}
 */
const createListener = (event, name, url, rootDirpath) => {
  const useLink = require('supports-hyperlinks').stderr;
  const testStackTrace = createStackTraceTester(rootDirpath);
  const passThrough = err => {
    if (!hasNonBugginEventListeners([event])) {
      switch (event) {
        case EVENT_UNCAUGHT_EXCEPTION: {
          process.nextTick(() => {
            throw err; // node-do-not-add-exception-line
          });
          break;
        }
        case EVENT_UNHANDLED_REJECTION: {
          Promise.reject(err);
        }
      }
    }
  };

  /**
   * @type {NodeJS.UncaughtExceptionListener|NodeJS.UnhandledRejectionListener}
   * @todo the NodeJS.UncaughtExceptionListener type is incorrect and omits the
   * second parameter, `origin`, which is going to be "uncaughtException" in
   * this case.
   */
  const listener = (err, origin) => {
    if (isError(err) && testStackTrace(err)) {
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
      setup.disable();
    }
    passThrough(err);
  };
  listener[kBugginListener] = true;
  return listener;
};

/**
 * This creates listeners and stores the config globally.
 * @param {BugginConfig} config
 */
const createListeners = ({name, url, root}) => {
  process.prependOnceListener(
    EVENT_UNCAUGHT_EXCEPTION,
    /**
     * @type {NodeJS.UncaughtExceptionListener}
     */
    (createListener(EVENT_UNCAUGHT_EXCEPTION, name, url, root))
  );
  // why doesn't this need the annotation and the above does?
  process.prependOnceListener(
    EVENT_UNHANDLED_REJECTION,
    createListener(EVENT_UNHANDLED_REJECTION, name, url, root)
  );

  buggin.config[name] = {url, root};
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
    let parentPath = parentModule();
    while (parentPath) {
      parentPath = parentModule(parentPath);
    }
    entryPoint = parentPath;
  }
  return (findEntryPoint.cached = entryPoint);
};
/**
 * @type {string}
 */
findEntryPoint.cached = undefined;

/**
 * Configures buggin for a module.
 * "This function has high cyclomatic complexity"
 * @param {string|import('type-fest').PackageJson|NodeJS.Module} [pkgValue]
 * @param {Partial<BugginSetupOptions>} [opts]
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

  if (buggin.config[pkgName]) {
    // TODO warn
    // don't re-register
    return;
  }

  if (!force && hasNonBugginEventListeners()) {
    // we can't just throw out of here, since an uncaught exception listener already
    // exists.  I mean, I suppose we COULD, but there's much less of a guarantee that this
    // message would get to the developer.
    const err = new Error(`process Event listener(s) already exist which were not added by buggin. This might cause unexpected behavior.
Pass option \`{force: true}\` to \`buggin()\` to add listeners anyway.
`);
    fs.writeSync(
      // @ts-ignore
      process.stderr.fd,
      err.stack
    );
    process.exit(1);
  }

  createListeners({url, root: pkgPath, name: pkgName});
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
 * @typedef {Object} BugginConfig
 * @property {string} url
 * @property {string} root
 * @property {string} name
 */

/**
 * @typedef {Object} BugginSetupOptions
 * @property {boolean} force
 * @property {string} name
 * @property {string|NodeJS.Module} entryPoint - A path to a package's root directory or a Module
 */

/**
 * @typedef {Object} PackageInfo
 * @property {string} pkgPath - Path to package.json
 * @property {import('normalize-package-data').Package} pkg - package.json contents
 */
