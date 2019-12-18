const {yellow, bold, red} = require('ansi-colors');
const emoji = require('node-emoji');
const HEART = emoji.get('heart');
const EXCLAMATION = emoji.get('exclamation');

module.exports = ({isPromise, projectName, url}) => {
  const name = yellow(projectName);
  const width = Math.floor((process.stdout.columns || 72) / 2);
  const line = red(new Array(width).fill('*').join(' '));
  const errorType = isPromise ? 'unhandled rejection' : 'uncaught exception';

  return `${line}

${EXCLAMATION} The following ${errorType} is likely a bug in ${name}.

${bold('Please')} report the issue at:

${url}

Thanks! ${HEART}

-- ${name} maintainers

${line}
`;
};
