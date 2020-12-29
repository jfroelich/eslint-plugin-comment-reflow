import type estree from 'estree';
import { CommentContext } from './comment-context';
import { CommentLine } from './comment-line';
import { checkLineOverflow } from './line-overflow';
import { checkLineUnderflow } from './line-underflow';

export function checkLineComment(context: CommentContext, comment: estree.Comment,
  previousLine: CommentLine, currentLine: CommentLine) {
  // Ignore trailing line comments. Eventually this can be supported but doing so complicates the
  // logic so for now just ignore.

  const previousToken = context.code.getTokenBefore(comment, { includeComments: true });
  if (previousToken && previousToken.loc.end.line === comment.loc.start.line) {
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
