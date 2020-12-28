import eslint from 'eslint';
import { CommentContext } from '../comment-context';
import { CommentLine } from '../comment-line';
import { findContentBreak } from '../find-content-break';
import { tokenize } from '../tokenize';

export function checkBlockUnderflow(context: CommentContext, previousLine: CommentLine,
  currentLine: CommentLine) {
  if (context.in_md_fence || context.in_jsdoc_example) {
    return;
  }

  // If the length of the content of the previous line is 0 then it represents a paragraph break
  // and should not be considered underflow.
  // TODO: what about a line that appears empty but is actually whitespace?

  if (previousLine.content.length === 0) {
    return;
  }

  // If the length of the previous line is greater than or equal to the threshold then the previous
  // line does not underflow.

  if (previousLine.lead_whitespace.length + previousLine.open.length + previousLine.prefix.length +
    previousLine.content.length >= context.max_line_length) {
    return;
  }

  // If the current line has no content then the previous line does not underflow.

  if (currentLine.content.length === 0) {
    return;
  }

  if (previousLine.directive.length > 0) {
    return;
  }

  if (currentLine.markup.startsWith('*') || currentLine.markup.startsWith('-') ||
    /^\d/.test(currentLine.markup)) {
    return;
  }

  // TODO: markdown header should be parsed as markup

  if (/^#{1,6}/.test(currentLine.markup)) {
    return;
  }

  if (currentLine.markup.startsWith('@')) {
    return;
  }

  if (/^\|.+\|$/.test(currentLine.content)) {
    return;
  }

  // TODO: todo and warn and so on should be parsed as markup

  if (/^todo\(?.+\)?\:|warn\:|hack\:/i.test(currentLine.content)) {
    return;
  }

  // TODO: there is no point to finding the content break in the case of underflow. Not sure what I
  // was thinking earlier. Take a look at how I solved this in the line underflow logic.

  // Find the breakpoint in the previous line. This tries to find a breaking space earlier in the
  // line. If not found, then this is -1. However, -1 does not indicate that the content is at the
  // threshold. -1 only means no earlier breakpoint found.

  const previousLineBreakpoint = findContentBreak(previousLine, context.max_line_length);

  let effectivePreviousLineBreakpoint;
  if (previousLineBreakpoint === -1) {
    // If we did not find an early breakpoint, then the effective breakpoint is the character at the
    // end of the suffix.
    effectivePreviousLineBreakpoint = Math.min(context.max_line_length,
      previousLine.lead_whitespace.length + previousLine.open.length + previousLine.prefix.length +
      previousLine.content.length + previousLine.suffix.length);
  } else {
    effectivePreviousLineBreakpoint = previousLineBreakpoint;
  }

  // Check if the effective breakpoint in the previous line leaves room for any amount of additional
  // content. We add 1 to account for the extra space we will insert.

  if (effectivePreviousLineBreakpoint + 1 >= context.max_line_length) {
    return;
  }

  // Split the current content into word and space tokens. We know the first token is a word because
  // we know that content does not include leading whitespace and is not empty.

  const tokens = tokenize(currentLine.content);

  let spaceRemaining = context.max_line_length - effectivePreviousLineBreakpoint;
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
