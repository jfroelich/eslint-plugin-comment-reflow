import eslint from 'eslint';
import { CommentLine, endIndexOf, tokenize } from './util';

export function merge(previous: CommentLine, current: CommentLine) {
  if (previous.context.in_md_fence || previous.context.in_jsdoc_example) {
    return;
  }

  if (current.index - previous.index !== 1) {
    return;
  }

  if (!previous.content || !current.content) {
    return;
  }

  if (previous.directive || current.directive || current.fixme) {
    return;
  }

  const previousLineEndPosition = endIndexOf(previous, 'suffix');
  if (previousLineEndPosition >= previous.context.max_line_length) {
    return;
  }

  if (current.comment.type === 'Block' && (current.markup.startsWith('*') ||
    current.markup.startsWith('-') || /^\d/.test(current.markup))) {
    return;
  }

  if (current.comment.type === 'Block' && current.markup.startsWith('@')) {
    return;
  }

  const tokens = tokenize(current.content);

  const isHyphenMerge = (tokens[0] === '-' && !previous.content.endsWith('-')) ||
    (tokens[0] !== '-' && previous.content.endsWith('-'));

  let spaceRemaining = previous.context.max_line_length - previousLineEndPosition;

  if (!isHyphenMerge) {
    spaceRemaining--;
  }

  const fittingTokens = [];
  for (const token of tokens) {
    if (token.length <= spaceRemaining) {
      fittingTokens.push(token);
      spaceRemaining -= token.length;
    } else {
      break;
    }
  }

  if (fittingTokens.length === 0) {
    return;
  }

  // Merging the tokens can result in either whitespace ending the previous line or starting the
  // current line. We want to exclude this one whitespace token. We could leave it up to the
  // no-trailing-spaces rule but it seems inefficient. I think taking a destructive action is better
  // here. Keep in mind that the only way back is undo, since by trimming and substituting one or
  // more spaces for a single space, we lose the original spacing. If the number of tokens being
  // moved is even, that means the last token being moved is whitespace. In that case, build the
  // token text out of all tokens except for that final whitespace token. We cannot use the is-even
  // trick to detect where the whitespace is because of hyphens.

  let tokenText: string;
  const lastFitTokenIsWhiteSpace = fittingTokens[fittingTokens.length - 1].trim().length === 0;
  if (lastFitTokenIsWhiteSpace) {
    tokenText = fittingTokens.slice(0, -1).join('');
  } else {
    tokenText = fittingTokens.join('');
  }

  // Compose the replacement text. If we are merging hyphens then we want to merge the tokens
  // immediately after the end of the previous line content. If we are not merging hyphens, then we
  // want to insert an extra space to prevent the adjacency.

  let replacementText = isHyphenMerge ? tokenText : ' ' + tokenText;

  // If we are not merging the entire current line into the previous line, then we want to append
  // the start of the next comment into the replacement text.

  if (tokenText.length < current.content.length) {
    const open = current.comment.type === 'Block' ? '' : '//';
    replacementText += '\n' + current.lead_whitespace + open + current.prefix;
  }

  // Merging the tokens may result in either a whitespace token ending the previous line or starting
  // the current line. So, we want to calculate an extra amount by which to shift the end range so
  // that the whitespace is removed. If the last token is whitespace then we append by that amount
  // of space. If the last token to move to the previous line is not whitespace, then there may be
  // leading whitespace leftover on the current line that we want to exclude. We will exclude by
  // artificially extending the replacement range end index by the length of that whitespace token.

  // TODO: this feels wrong now with the hyphen change to tokenize, i have managed to confuse myself
  // regarding what this second branch is even doing.

  let whitespaceExtensionLength = 0;
  if (lastFitTokenIsWhiteSpace) {
    whitespaceExtensionLength = fittingTokens[fittingTokens.length - 1].length;
  } else if (tokens.length > fittingTokens.length &&
    (tokens.length - fittingTokens.length) % 2 === 0) {
    whitespaceExtensionLength = tokens[fittingTokens.length].length;
  }

  const rangeStart = previous.context.code.getIndexFromLoc({
    line: previous.index,
    column: endIndexOf(previous, 'content')
  });

  const rangeEnd = previous.context.code.getIndexFromLoc({
    line: current.index,
    column: endIndexOf(current, 'prefix') + tokenText.length + whitespaceExtensionLength
  });

  const report: eslint.Rule.ReportDescriptor = {
    node: previous.context.node,
    loc: {
      start: {
        line: previous.index,
        column: previous.lead_whitespace.length + previous.open.length + previous.prefix.length
      },
      end: {
        line: current.index,
        column: current.text.length
      }
    },
    messageId: 'merge',
    data: {
      line_length: `${current.text.length}`,
      max_length: `${previous.context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.replaceTextRange([rangeStart, rangeEnd], replacementText);
    }
  };

  return report;
}
