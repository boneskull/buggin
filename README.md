# buggin

> :bug: help your users report unexpected errors originating in your buggy app :grimacing:

_buggin_ will examine uncaught exceptions for errors coming out of your code, and ask the user to create a bug report. It looks like this:

![screenshot of output](assets/screenshot.png)

The new issue will be pre-filled with the exception and other info. Neat!

## Install

**Currently, `buggin` only works with repos hosted on GitHub.**

The usual:

```bash
npm i buggin
```

## Usage

### Basic Usage

You only need to do this once. You should do this in your CLI app entry point (the script in your `bin` prop of `package.json`).

```js
#!/usr/bin/env node

require('buggin')(module);

// setup your cli app using yargs, commander, etc.
```

### Advanced Usage

#### Use With Existing Uncaught Exception & Unhandled Rejection Listeners

If your module (or some module you're consuming) listens on [Process.uncaughtException](https://nodejs.org/dist/latest-v12.x/docs/api/process.html#process_event_uncaughtexception) or [Process.unhandledRejection](https://nodejs.org/dist/latest-v12.x/docs/api/process.html#process_event_unhandledrejection), `buggin` will refuse to set up its own listeners, print a message to `STDERR` with a warning, and exit the process.

If you'd still like to try it, pass `force: true` to the options argument:

```js
buggin(module, {force: true});
```

Because your own listeners could do literally anything and `buggin` can't know what it is they are doing, you'll just have to try it.

#### Manual Configuration

The [auto-configuration](#auto-configuration) behavior can be overridden by a few other options:

```js
// custom package name
buggin(module, {name: 'custom name'});

// custom package json with custom entryPoint (for stack sniffing)
buggin(require('/path/to/package.json'), {entryPoint: '/my/package/root/'});

// path to package.json
buggin('/path/to/package.json');
```

## How It Works

`buggin` does what it thinks is correct, but its understanding of what "correct" means is up for [further discussion](https://github.com/boneskull/buggin/issues).

### Interception of Uncaught Exceptions & Unhandled Rejections

`buggin` _prepends_ a listener to both the [Process.uncaughtException](https://nodejs.org/dist/latest-v12.x/docs/api/process.html#process_event_uncaughtexception) and [Process.unhandledRejection](https://nodejs.org/dist/latest-v12.x/docs/api/process.html#process_event_unhandledrejection) events. If one of these events is emitted _with an `Error` argument_, `buggin` will:

1. Make a naive attempt to check whether the `stack` prop of the `Error` contains your package's main module or custom entry point.
2. Print a notification to `STDERR` and a link to the "new issue" page. If the user's terminal supports it, the URL will be displayed as a clickable link, with the requisite querystring hidden; otherwise the entire URL (with query string) will be displayed for the user to copy/paste.
3. `buggin` disables _all_ of its listeners (including this one).
4. `buggin` makes a choice:
   1. If there's no other listener _which was not added by `buggin`_ for the emitted event, the error...
      1. ...if an uncaught exception, will be _rethrown on the next tick_ out of `buggin`'s listener.
      2. ...if an unhandled rejection, will be _re-rejected_ from the handler.
   2. In both above "pass through" situations, `buggin` attempts to mimic the default behavior as closely as possible. It _will_ suppress the callsite of its rethrow/rejection, which is unhelpful because ti will point to code in `buggin`. _There may be a way to save this info from the original error?_
   3. If there _is_ another listener, `buggin` will _not_ rethrow (nor re-reject), and will continue to the next listener as per standard Node.js EE behavior.

### Auto-Configuration

`buggin` attempts to automatically determine the package name and the URL from your package's `package.json`. The logic is kind of gross, but by default, it looks for _closest `package.json` to the main (entry) script_, and pulls the info out.

## Motivation

This is the _opposite_ of "This is probably not a problem with npm." The fact is, if someone is running your CLI app (and you aren't invoking someone else's code), it _is_ your problem. Wouldn't you like to fix it?

Most users don't bother to report bugs, so maybe this will help!

## Caveats

- This module is _intended_ for use with CLI apps. That said, if you have an idea for better library support, [propose something](https://github.com/boneskull/buggin/issues)!
- I'm not very confident the stack-sniffing stuff works in the general case. It attempts to match the file where the exception was thrown to a package which registered buggin, but I'm probably missing something here.
- Under normal circumstances, Node.js will exit with code 7 if an uncaught exception is handled and rethrown from the listener. Because `buggin` does not rethrow out of the listener _per se_--and instead rethrows on "next tick"--the process will exit with code 1 (as if no such handling occurred).
- Behavior on unhandled rejection depends on the version of Node.js used. Node.js v12 added a [`--unhandled-rejections-mode` option](https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode), which allows for greater control over whether an unhandled rejection is considered a "warning" or a nonzero-exit-code-producing error.
- `buggin` ignores non-`Error` exceptions or rejections. If your code is rejecting with a string value... stop it.
- `buggin` throws stuff in the `global` context (a singleton prop called `buggin` which stores its configuration), because JavaScript.

## TODO

- Custom output template
- Custom issue template (can we reference an existing GitHub issue template?)

## License

Licensed Apache-2.0
