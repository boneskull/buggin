# buggin

> Help your users report errors! For CLI apps.

_buggin_ will examine uncaught exceptions for errors coming out of your code, and ask the user to create a bug report. It looks like this:

![screenshot of output](assets/screenshot.png)

The new issue will be pre-filled with the exception and other info. Neat!

**Currently, `buggin` only works with repos hosted on GitHub.**

## Install

## Usage

### Basic Usage

You only need to do this once. You should do this in your CLI app entry point (the script in your `bin` prop of `package.json`).

```js
#!/usr/bin/env node

require('buggin')(module);

// setup your cli app using yargs, commander, etc.
```

### Advanced Usage

If your module (or some module you're consuming) listens on [Process.uncaughtException](https://nodejs.org/dist/latest-v12.x/docs/api/process.html#process_event_uncaughtexception) or [Process.unhandledRejection](https://nodejs.org/dist/latest-v12.x/docs/api/process.html#process_event_unhandledrejection), `buggin` will refuse to set up its own listeners, print a message to `STDERR` with a warning, and exit the process.

If you'd still like to try it, pass `force: true` to the options argument:

```js
buggin(module, {force: true});
```

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

### Interception of Uncaught Exceptions & Unhandled Rejections

`buggin` _prepends_ a listener to both the [Process.uncaughtException](https://nodejs.org/dist/latest-v12.x/docs/api/process.html#process_event_uncaughtexception) and [Process.unhandledRejection](https://nodejs.org/dist/latest-v12.x/docs/api/process.html#process_event_unhandledrejection) events. If one of these events is emitted _with an `Error` argument_, `buggin` will:

1. Make a naive attempt to check whether the `stack` prop of the `Error` contains your package's main module or custom entry point.
2. Print a notification to `STDERR` and a link to the "new issue" page. If the user's terminal supports it, the URL will be displayed as a clickable link, with the requisite querystring hidden; otherwise the entire URL (with query string) will be displayed for the user to copy/paste.
3. `buggin` disables its listeners.
4. `buggin` makes a choice:
   1. If there's no other listener _which was not added by `buggin`_ for the emitted event, the event will be _rethrown on the next tick_ out of `buggin`'s listener. In other words, if you aren't listening on these events yourself, Node.js' default behavior for the event will be invoked.
   2. If there _is_ another listener, `buggin` will _not_ rethrow, and will continue to the next listener.

### Auto-Configuration

`buggin` attempts to automatically determine the package name and the URL from your package's `package.json`. The logic is kind of gross, but by default, it looks for _closest `package.json` to the main (entry) script_, and pulls the info out.

## Motivation

This is the _opposite_ of "This is probably not a problem with npm." The fact is, if someone is running your CLI app (and you aren't invoking someone else's code), it _is_ your problem. Wouldn't you like to fix it?

Most users don't bother to report bugs, so maybe this will help!

## Caveats

- This module is intended for use with CLI apps, but a library could potentially consume it--but it needs more thought.
- The behavior if multiple CLI apps/libraries attempt to use `buggin` at once is as-of-yet undefined.
- The stack-sniffing stuff might need to be ripped out, because it's highly dependent on the length of the stack and the stack size limit.

## TODO

- Custom output template
- More tests

## License

Licensed Apache-2.0
