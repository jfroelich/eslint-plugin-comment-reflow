import eslint from 'eslint';
import type estree from 'estree';
import { CommentContext } from './comment-context';
import { CommentLine } from './comment-line';
import { getRegionLength } from "./get-region-length";
import { tokenize } from './tokenize';

export function merge(context: CommentContext, type: estree.Comment['type'], previous: CommentLine,
  current: CommentLine) {
  if (context.in_md_fence || context.in_jsdoc_example) {
    return;
  }

  if (current.index - previous.index !== 1) {
    return;
  }

  if (previous.content.length === 0 || current.content.length === 0) {
    return;
  }

  const previousLineEndPosition = getRegionLength(previous, 'suffix');

  if (previousLineEndPosition >= context.max_line_length) {
    return;
  }

  if (type === 'Block' && (current.markup.startsWith('*') || current.markup.startsWith('-') ||
    /^\d/.test(current.markup))) {
    return;
  }

  if (type === 'Block' && current.markup.startsWith('@')) {
    return;
  }

  if (previous.directive.length > 0 || current.directive.length > 0) {
    return;
  }

  if (current.fixme.length > 0) {
    return;
  }

  // add +1 for the extra space we will insert

  if (previousLineEndPosition + 1 >= context.max_line_length) {
    return;
  }

  // We know the first token is a word because we know that content does not include leading
  // whitespace and is not empty.

  const tokens = tokenize(current.content);

  let spaceRemaining = context.max_line_length - previousLineEndPosition;

  const fittingTokens = [];
  for (const token of tokens) {
    if (token.length < spaceRemaining) {
      fittingTokens.push(token);
      spaceRemaining -= token.length;
    } else {
      break;
    }
  }

  if (fittingTokens.length === 0) {
    return;
  }

  let tokenText = '';

  // Merging the tokens can result in either whitespace ending the previous line or starting the
  // current line. We want to exclude this one whitespace token. We could leave it up to the
  // no-trailing-spaces rule but it seems inefficient. I think taking a destructive action is better
  // here. Keep in mind that the only way back is undo, since by trimming and substituting one or
  // more spaces for a single space, we lose the original spacing. If the number of tokens being
  // moved is even, that means the last token being moved is whitespace. In that case, build the
  // token text out of all tokens except for that final whitespace token.

  const lastFitTokenIsWhiteSpace = fittingTokens.length % 2 === 0;
  if (lastFitTokenIsWhiteSpace) {
    tokenText = fittingTokens.slice(0, -1).join('');
  } else {
    tokenText = fittingTokens.join('');
  }

  // Compose the replacement text. We add in a space since we are removing a line break and do not
  // want to end up merging two non-whitespace tokens into one.

  let replacementText = ' ' + tokenText;

  // If we are not merging the entire line, then we want to append the start of the next comment
  // into the replacement text.

  if (tokenText.length < current.content.length) {
    const open = type === 'Block' ? '' : '//';
    replacementText += '\n' + current.lead_whitespace + open + current.prefix;
  }

  // Merging the tokens may result in either a whitespace token ending the previous line or starting
  // the current line. So, we want to calculate an extra amount by which to shift the end range so
  // that the whitespace is removed. If the last token is whitespace then we append by that amount
  // of space. If the last token to move to the previous line is not whitespace, then there may be
  // leading whitespace leftover on the current line that we want to exclude. We will exclude by
  // artificially extending the replacement range end index by the length of that whitespace token.

  let whitespaceExtensionLength = 0;
  if (lastFitTokenIsWhiteSpace) {
    whitespaceExtensionLength = fittingTokens[fittingTokens.length - 1].length;
  } else if (tokens.length > fittingTokens.length &&
    (tokens.length - fittingTokens.length) % 2 === 0) {
    whitespaceExtensionLength = tokens[fittingTokens.length].length;
  }

  const rangeStart = context.code.getIndexFromLoc({
    line: previous.index,
    column: getRegionLength(previous, 'content')
  });

  const rangeEnd = context.code.getIndexFromLoc({
    line: current.index,
    column: getRegionLength(current, 'prefix') + tokenText.length + whitespaceExtensionLength
  });

  const replacementRange: eslint.AST.Range = [rangeStart, rangeEnd];

  const report: eslint.Rule.ReportDescriptor = {
    node: context.node,
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
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.replaceTextRange(replacementRange, replacementText);
    }
  };

  return report;
}
