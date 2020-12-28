import eslint from 'eslint';
import { CommentContext } from '../comment-context';
import { CommentLine } from '../comment-line';
import { getRegionLength } from '../get-region-length';
import { tokenize } from '../tokenize';

export function checkBlockUnderflow(context: CommentContext, previousLine: CommentLine,
  currentLine: CommentLine) {
  if (context.in_md_fence || context.in_jsdoc_example) {
    return;
  }

  // If the length of the content of the previous line is 0 then it represents a paragraph break and
  // should not be considered underflow. Similarly, if the current line has no content then the
  // previous line does not underflow.

  if (previousLine.content.length === 0 || currentLine.content.length === 0) {
    return;
  }

  // If the length of the previous line is greater than or equal to the threshold then the previous
  // line does not underflow.

  if (previousLine.lead_whitespace.length + previousLine.open.length + previousLine.prefix.length +
    previousLine.content.length >= context.max_line_length) {
    return;
  }

  if (previousLine.directive || currentLine.directive) {
    return;
  }

  // Prevent markdown on current line from being merged into previous line.

  if (currentLine.markup.startsWith('*') || currentLine.markup.startsWith('-') ||
    /^\d/.test(currentLine.markup)) {
    return;
  }

  // Prevent jsdoc tag on current line from being merged into previous line.

  if (currentLine.markup.startsWith('@')) {
    return;
  }

  // Prevent fixme tag on current line from being merged into previous line.

  if (currentLine.fixme.length > 0) {
    return;
  }

  const previousLineEndPosition = getRegionLength(previousLine, 'suffix');

  if (previousLineEndPosition + 1 >= context.max_line_length) {
    return;
  }

  let spaceRemaining = context.max_line_length - previousLineEndPosition;

  // Split the current content into word and space tokens. We know the first token is a word because
  // we know that content does not include leading whitespace and is not empty.

  const tokens = tokenize(currentLine.content);
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

  const tokenText = fittingTokens.join('');

  // Compose the replacement text. We have to take into account whether we are merging the entire
  // current line into the previous line because all tokens fit.

  let replacementText = ' ' + tokenText;
  if (tokenText.length < currentLine.content.length) {
    replacementText += '\n' + currentLine.lead_whitespace + currentLine.prefix;
  }

  const rangeStart = context.code.getIndexFromLoc({
    line: previousLine.index,
    column: previousLine.lead_whitespace.length + previousLine.open.length +
      previousLine.prefix.length + previousLine.content.length
  });

  const rangeEnd = context.code.getIndexFromLoc({
    line: currentLine.index,
    column: currentLine.lead_whitespace.length + currentLine.prefix.length +
    tokenText.length
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
