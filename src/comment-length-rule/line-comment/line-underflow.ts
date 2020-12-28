import eslint from 'eslint';
import { CommentContext } from '../comment-context';
import { CommentLineDesc, getContentLengthInclusive, getPrefixLengthInclusive, getSuffixLengthInclusive } from '../comment-line-desc';
import { tokenize } from '../tokenize';

/**
 * @todo passing in one context or another is weird, i think context maybe really should be unlinked
 * from comment? maybe all the comment specific parts inside context should be embedded instead
 * inside line, and the comment context then should be generic to all comments. right now we are
 * cheating with the promise to not access comment-specific data in the context
 * @todo there is ridiculous overlap with block overflow, maybe i need to think this, maybe what i
 * want is a general underflow check that is not specific to the comment type.
 */
export function checkLineUnderflow(context: CommentContext, previousLine: CommentLineDesc,
  currentLine: CommentLineDesc) {
  // If the previous line is not immediately preceding the current line then we do not consider
  // underflow. This can happen because the caller passes in any previous line comment, not only the
  // immediately previous line comment.

  if (currentLine.index - previousLine.index !== 1) {
    return;
  }

  // TODO: if the two lines have different prefix lengths then do we prevent underflow? is that
  // an author's intent to say two lines are different or is that laziness?

  // If either line has no content then do not consider underflow. These are basically empty lines
  // in a comment, which is routine. Assume the author wants to keep lines separate.

  if (previousLine.content.length === 0 || currentLine.content.length === 0) {
    return;
  }

  // If the length of the previous line is greater than or equal to the threshold then the previous
  // line does not underflow. Note that here we count the suffix, which is the trailing whitespace.
  // It is ambiguous whether trailing whitespace is deemed content. Perhaps there should be a config
  // option. For now, to be safe, we assume that if the author wants to leave in trailing whitespace
  // that it is intentional and part of the content and that if they wanted to avoid this problem
  // they would use the no-trailing-spaces rule. Keep in mind this can lead to strange things, where
  // it looks like two lines should be merged, but they should not be, because of the suffix. I
  // myself keep screwing this up thinking there is an error, but this is not an error.

  if (getSuffixLengthInclusive(previousLine) >= context.max_line_length) {
    return;
  }

  if (previousLine.content.startsWith('eslint-')) {
    return;
  }

  if (previousLine.content.startsWith('@ts-')) {
    return;
  }

  if (previousLine.content.startsWith('tslint:')) {
    return;
  }

  if (/^\/\s<(reference|amd)/.test(previousLine.content)) {
    return;
  }

  if (currentLine.content.startsWith('eslint-')) {
    return;
  }

  if (currentLine.content.startsWith('@ts-')) {
    return;
  }

  if (currentLine.content.startsWith('tslint:')) {
    return;
  }

  if (currentLine.content.startsWith('TODO:')) {
    return;
  }

  if (currentLine.content.startsWith('WARN:')) {
    return;
  }

  if (currentLine.content.startsWith('HACK:')) {
    return;
  }

  if (currentLine.content.startsWith('TODO(')) {
    return;
  }

  const previousLineEndPosition = getSuffixLengthInclusive(previousLine);

  // Check if the ending position in the previous line leaves room for any amount of additional
  // content. We add 1 to account for the extra space we will insert.

  if (previousLineEndPosition + 1 >= context.max_line_length) {
    return;
  }

  // Split the current content into word and space tokens. We know the first token is a word because
  // we know that content does not include leading whitespace and is not empty.

  const tokens = tokenize(currentLine.content);

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

  if (tokenText.length < currentLine.content.length) {
    replacementText += '\n' + currentLine.lead_whitespace + '//' + currentLine.prefix;
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
    line: previousLine.index,
    column: getContentLengthInclusive(previousLine)
  });

  const rangeEnd = context.code.getIndexFromLoc({
    line: currentLine.index,
    column: getPrefixLengthInclusive(currentLine) + tokenText.length + whitespaceExtensionLength
  });

  const replacementRange: eslint.AST.Range = [rangeStart, rangeEnd];

  const report: eslint.Rule.ReportDescriptor = {
    node: context.node,
    loc: {
      start: {
        line: previousLine.index,
        column: 0
      },
      end: {
        line: currentLine.index,
        column: currentLine.text.length
      }
    },
    messageId: 'underflow',
    data: {
      line_length: `${currentLine.text.length}`,
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.replaceTextRange(replacementRange, replacementText);
    }
  };

  return report;
}
