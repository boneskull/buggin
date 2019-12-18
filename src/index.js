const path = require('path');
const fs = require('fs');
const emoji = require('node-emoji');
const color = require('ansi-colors');
const {sync: readPkg} = require('read-pkg');
const {stderr: supportsColor} = require('supports-color');
const defaultBuilder = require('./default-builder');
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
 * Creates buggin's global store, or returns a reference to it if it already exists.
 */
const install = () => {
  if (global[kBuggin]) {
    return global[kBuggin];
  }
  const buggin = Object.create(null);
  buggin.config = Object.create(null);
  Object.defineProperty(buggin.config, 'hasMainListener', {
    get() {
      return Object.values(this).some(({isMain}) => isMain);
    }
  });
  Object.freeze(buggin);
  global[kBuggin] = buggin;
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
 * @param {BugginConfig} config
 * @returns {NodeJS.UncaughtExceptionListener|NodeJS.UnhandledRejectionListener}
 */
const createListener = (event, {name, url, reject = () => false, builder}) => {
  const useLink = require('supports-hyperlinks').stderr;

  /**
   * @param {Error|{}} err
   */
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
    if (isError(err)) {
      try {
        if (!reject(err)) {
          // typedef is wrong here
          // @ts-ignore
          const isPromise = origin && origin !== 'uncaughtException';
          color.enabled = supportsColor;
          let linkString;
          if (useLink) {
            const {link} = require('ansi-escapes');
            linkString = link(`${url}/new`, buildUrl(url, err));
          } else {
            linkString = buildUrl(url, err);
          }
          let output = builder({
            error: err,
            isPromise,
            projectName: name,
            url: linkString,
            supportsColor
          });
          if (!supportsColor) {
            output = emoji.strip(output);
          }

          fs.writeSync(
            // @ts-ignore
            process.stderr.fd,
            output
          );
        }
      } catch (err) {
        console.error(err);
      } finally {
        setup.disable();
      }
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
const createListeners = config => {
  if (buggin.config.hasMainListener) {
    return;
  }
  setup.disable();

  const uncaughtExceptionListener = /**
   * @type {NodeJS.UncaughtExceptionListener}
   */ (createListener(EVENT_UNCAUGHT_EXCEPTION, config));
  process.prependOnceListener(
    EVENT_UNCAUGHT_EXCEPTION,
    uncaughtExceptionListener
  );

  const unhandledRejectionListener = createListener(
    EVENT_UNHANDLED_REJECTION,
    config
  );
  process.prependOnceListener(
    EVENT_UNHANDLED_REJECTION,
    unhandledRejectionListener
  );

  buggin.config[config.name] = config;
};

/**
 * @param {string} cwd
 */
const readPackage = cwd => {
  const {sync: findUp} = require('find-up');

  const pkgPath = findUp('package.json', {cwd});
  if (pkgPath) {
    const pkg = readPkg({cwd: path.dirname(pkgPath)});
    return normalizePackage(pkg);
  }
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
const normalizePackage = pkg => {
  require('normalize-package-data')(pkg);
  return pkg;
};

/**
 *
 * @param {NodeJS.Module|string} [entryPoint]
 */
const findEntryPoint = entryPoint => {
  if (entryPoint) {
    if (typeof entryPoint === 'string') {
      return entryPoint;
    }
    if (isModule(entryPoint)) {
      return entryPoint.filename;
    }
  }
  return require.main.filename;
};

/**
 * Configures buggin for a module.
 * @param {string|import('type-fest').PackageJson|NodeJS.Module} [pkgValue]
 * @param {Partial<BugginSetupOptions>} [opts]
 */
function setup(
  pkgValue,
  {force = false, name = '', entryPoint, reject, builder} = {}
) {
  /**
   * @type {string}
   */
  let url;

  /**
   * @type {import('normalize-package-data').Package}
   */
  let pkg;

  let isMain = false;

  if (!pkgValue) {
    const tempEntryPoint = findEntryPoint();
    pkg = readPackage(tempEntryPoint);
    isMain = tempEntryPoint === require.main.filename;
  } else if (typeof pkgValue === 'string') {
    if (pkgValue.startsWith('http')) {
      url = pkgValue;
    } else if (require('is-email-like')(pkgValue)) {
      url = `mailto:${pkgValue}`;
    }
    const tempEntryPoint = findEntryPoint(entryPoint);
    pkg = readPackage(url ? tempEntryPoint : pkgValue);
    isMain = tempEntryPoint === require.main.filename;
  } else if (isModule(pkgValue)) {
    if (entryPoint) {
      throw new Error(
        `The "entryPoint" option cannot be used when passing a Module to buggin.`
      );
    }
    pkg = readPackage(pkgValue.filename);
    isMain = pkgValue === require.main;
  } else if (
    typeof pkgValue === 'object' &&
    (pkgValue.bugs || pkgValue.repository)
  ) {
    if (typeof entryPoint !== 'string' || !isModule(entryPoint)) {
      throw new TypeError(
        `If provding a parsed package.json object, the "entryPoint" option must be a path to the package root directory or a Module object.`
      );
    }
    pkg = normalizePackage(pkgValue);
    const tempEntryPoint = findEntryPoint(entryPoint);
    isMain = tempEntryPoint === require.main.filename;
  } else {
    const {inspect} = require('util');
    throw new TypeError(`Invalid value passed to buggin: ${inspect(pkgValue)}`);
  }

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

  createListeners({
    url,
    name: pkgName,
    reject,
    isMain,
    builder: builder || defaultBuilder
  });
}

/**
 * Remove all buggin listeners. Called automatically the first time a message is displayed. Disables buggin.
 */
function disable() {
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
  Object.keys(buggin.config).forEach(name => {
    delete buggin.config[name];
  });
}

module.exports = setup;
module.exports.disable = disable;

/**
 * Global configuration object; used internally
 * @typedef {Object} BugginConfig
 * @property {string} url - "New issue" URL
 * @property {string} name - Package name
 * @property {boolean} isMain - `true` if config is considered to be from "main" package
 * @property {BugginRejectSelector?} reject - Rejection selector (unselector?)
 * @property {BugginMessageBuilder} builder - Message builder function
 */

/**
 * An optional callback which returns `true` if the error should be ignored by buggin
 * @callback BugginRejectSelector
 * @param {any} value - Typically an `Error`
 * @returns {boolean} Return `true` if buggin should ignore it
 */

/**
 * An optional callback which accepts data and returns a string to be displayed to the user when an error occurs
 * @callback BugginMessageBuilder
 * @param {BugginMessageBuilderData} data
 * @returns {string} Mesasge
 */

/**
 * Parameter for a `BugginMessageBuilder` callback
 * @typedef BugginMessageBuilderData
 * @property {boolean} isPromise - `true` if error came from a unhandled rejection
 * @property {string} projectName - Project name
 * @property {string} url - New issue URL
 * @property {Error} error - Original error
 * @property {boolean} supportsColor - `true` if the terminal supports color
 */

/**
 * buggin's main setup object, to be called by the library consumer.  All props are optional.
 * @typedef {Object} BugginSetupOptions
 * @property {BugginRejectSelector} reject - A function which accepts an `Error` and returns `true` if buggin should ignore it
 * @property {boolean} force - Listen on `Process` events (`unhandledRejection`/`uncaughtException`) even if other listeners are present
 * @property {string} name - Name of project; otherwise derived from `package.json`
 * @property {string|NodeJS.Module} entryPoint - A path to a package's root directory or a Module
 * @property {BugginMessageBuilder} builder - Message builder function
 */
