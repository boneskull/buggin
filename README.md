# buggin

> Help your users report errors! For CLI apps.

_buggin_ will examine uncaught exceptions for errors coming out of your code, and ask the user to create a bug report. It looks like this:

![screenshot of output](assets/screenshot.png)

The new issue will be pre-filled with the exception and other info. Neat!

## Usage

Require `buggin` and call it with `module`, a path to your `package.json`, or a parsed `package.json` object if you already have one.

You only need to do this once.

```js
#!/usr/bin/env node

require('buggin')(module);

// setup your cli app using yargs, commander, etc.
```

## Motivation

This is the _opposite_ of "This is probably not a problem with npm." The fact is, if someone is running your CLI app (and you aren't invoking someone else's code), it _is_ your problem. Wouldn't you like to fix it?

Most users don't bother to report bugs, so maybe this will help!

## License

Licensed Apache-2.0
