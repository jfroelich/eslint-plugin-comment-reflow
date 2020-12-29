import assert from 'assert';
import { CommentContext } from './comment-context';
import { CommentLine } from './comment-line';
import { checkLineOverflow } from './line-overflow';
import { checkLineUnderflow } from './line-underflow';

export function checkLineComment(context: CommentContext, previousLine: CommentLine,
  currentLine: CommentLine) {
  assert(context.comment.type === 'Line', `Line ${currentLine.index} is not type "Line"`);

  // Ignore trailing line comments. Eventually this can be supported but doing so complicates the
  // logic so for now just ignore.

  const previousToken = context.code.getTokenBefore(context.comment, { includeComments: true });
  if (previousToken && previousToken.loc.end.line === context.comment.loc.start.line) {
    return;
  }

  const overflowReport = checkLineOverflow(context, currentLine);
  if (overflowReport) {
    return overflowReport;
  }

  if (previousLine) {
    const underflowReport = checkLineUnderflow(context, previousLine, currentLine);
    if (underflowReport) {
      return underflowReport;
    }
  }
}
