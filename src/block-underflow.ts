import eslint from 'eslint';
import { CommentContext } from './comment-context';
import { CommentLineDesc } from './comment-line-desc';
import { findContentBreak } from './find-content-break';

export function checkBlockUnderflow(context: CommentContext, previousLine: CommentLineDesc,
  currentLine: CommentLineDesc) {
  console.debug('analyzing current line %d', currentLine.index);
  if (context.in_md_fence || context.in_jsdoc_example) {
    return;
  }

  // If the length of the content of the previous line is 0 then it represents a paragraph break
  // and should not be considered underflow.
  // TODO: what about a line that appears empty but is actually whitespace?

  if (previousLine.content.length === 0) {
    console.debug('the line that precedes line %d is empty and therefore does not underflow',
      currentLine.index);
    return;
  }

  // If the length of the previous line is greater than or equal to the threshold then the previous
  // line does not underflow.

  console.debug('the line that precedes line %d has length %d', currentLine.index,
    previousLine.lead_whitespace.length + previousLine.open.length + previousLine.prefix.length +
    previousLine.content.length);

  if (previousLine.lead_whitespace.length + previousLine.open.length + previousLine.prefix.length +
    previousLine.content.length >= context.max_line_length) {
    console.debug('the line that precedes line %d is too long to underflow', currentLine.index);
    return;
  }

  // If the current line has no content then the previous line does not underflow
  if (currentLine.content.length === 0) {
    console.debug('line %d has no content so line %d does not underflow', currentLine.index,
      previousLine.index);
    return;
  }

  // TODO: these should be parsed as markup

  if (previousLine.index === 1 && /^(global|jslint|property)\s/.test(previousLine.content)) {
    console.debug('line %d is global/jslint/property so underflow ignored', previousLine.index);
    return;
  }

  if (currentLine.markup.startsWith('*') || currentLine.markup.startsWith('-') ||
    /^\d/.test(currentLine.markup)) {
    console.debug('line %d has markup and so previous line does not underflow', currentLine.index);
    return;
  }

  // TODO: markdown header should be parsed as markup

  if (/^#+/.test(currentLine.markup)) {
    console.debug('line %d has header markup so previous line does not underflow',
      currentLine.index);
    return;
  }

  if (currentLine.markup.startsWith('@')) {
    console.debug('line %d has jsdoc so previous line does not underflow', currentLine.index);
    return;
  }

  if (/^\|.+\|$/.test(currentLine.content)) {
    console.debug('line %d is has markdown table syntax so previous line does not underflow',
      currentLine.index);
    return;
  }

  // TODO: todo and warn and so on should be parsed as markup

  if (/^todo\(?.+\)?\:|warn\:|hack\:/i.test(currentLine.content)) {
    console.debug('line %d has todo syntax so previous line does not underflow', currentLine.index);
    return;
  }

  // TODO: decide what text in the current line can be merged into the previous line, if any. I am
  // not quite sure how to do this. We kind of need to gather this information first in the previous
  // line and the logic needs to be identical. I think this means that the parsing has to happen in
  // parseLine, not in checkBlockOverflow? What we want to avoid is merging the text from the
  // current line into the previous line if it would then cause the previous line to overflow,
  // because that would cause an infinite loop (well, it would hit the eslint limit of 10). We could
  // try merging one word at a time from the current line into the previous provided that it fits
  // but this seems pretty inefficient. What we need to do is find the greatest number of word
  // tokens from the current line that can fit into the previous line. But in order to do that, we
  // need to determine how much room remains in the previous line. It might be the case that no
  // tokens fit at all.

  // Find the breakpoint in the previous line.

  const previousLineBreakpoint = findContentBreak(previousLine, context.max_line_length);
  let effectivePreviousLineBreakpoint;
  if (previousLineBreakpoint === -1) {
    effectivePreviousLineBreakpoint = context.max_line_length;
  } else {
    // we add 1 so that we count the space that should exist between the previous content and the
    // content merged in
    effectivePreviousLineBreakpoint = previousLineBreakpoint + 1;
  }

  // Check if the breakpoint in the previous line leaves room for additional content.

  if (effectivePreviousLineBreakpoint >= context.max_line_length) {
    console.debug('previous line %d breakpoint is too close to threshold to merge current line',
      previousLine.index, currentLine.index);
    return;
  }

  // TODO: tokenize the current line, then find the greatest number of tokens that can fit into the
  // space remaining in the previous line. for now do this in a sloppy way and do not worry about
  // accurately preserving space.

  // TODO: we need to preserve the whitespace

  const tokens = currentLine.content.split(/\s+/);

  console.debug('line %d tokens', currentLine.index, tokens);

  let spaceRemaining = context.max_line_length - effectivePreviousLineBreakpoint;
  console.debug('determined that there is %d space remaining in line', spaceRemaining,
    previousLine.index);

  const fittingTokens = [];
  for (const token of tokens) {
    if (token.length < spaceRemaining) {
      fittingTokens.push(token);
      // subtract 1 to account for the space we add
      spaceRemaining = spaceRemaining - token.length - 1;
    } else {
      break;
    }
  }

  if (fittingTokens.length === 0) {
    console.debug('no tokens in line %d fit into line %d', currentLine.index, previousLine.index);
    return;
  }

  console.debug('line %d tokens that fit into prev:', currentLine.index, fittingTokens);

  // We know that one or more tokens of the current line fit into the previous line. Now we want
  // to figure out the text we will be replacing.

  ///////////////////////////////////////////////////////////////////////////
  // TODO: none of the following has been refactored to work with the new line parsing, or
  // been corrected

  // Underflow can only occur if the next line does not look like a JSDoc line. We try to run this
  // regex last since it is expensive.

  // Compute the position of the start of the current line in the whole file. The +1 is the length
  // of the line break (which might be wrong right now).

  // let lineRangeStart = context.comment.range[0];
  // for (let lineCursor = context.comment.loc.start.line; lineCursor < currentLine.index; lineCursor++) {
  //   lineRangeStart += context.code.lines[lineCursor - 1].length + 1;
  // }

  // const report: eslint.Rule.ReportDescriptor = {
  //   node: context.node,
  //   loc: context.comment.loc,
  //   messageId: 'underflow',
  //   data: {
  //     line_length: `${currentLine.text.length}`,
  //     max_length: `${context.max_line_length}`
  //   },
  //   fix: function (fixer) {
  //     const adjustment = edge === -1 ? 2 : 3;
  //     const range: eslint.AST.Range = [
  //       lineRangeStart + context.code.lines[currentLine.index - 1].length,
  //       lineRangeStart + context.code.lines[currentLine.index - 1].length + 1 +
  //         context.code.lines[currentLine.index].indexOf('*') + adjustment
  //     ];

  //     return fixer.replaceTextRange(range, ' ');
  //   }
  // };

  // return report;

  // TEMP: doing this while in refactor to shutup eslint for a bit

  return <eslint.Rule.ReportDescriptor>null;
}
