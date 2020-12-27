import assert from 'assert';
import { CommentContext } from '../comment-context';
import { CommentLineDesc } from '../comment-line-desc';
import { checkLineOverflow } from './line-overflow';
import { checkLineUnderflow } from './line-underflow';

export function checkLineComment(previousContext: CommentContext, previousLine: CommentLineDesc,
  currentContext: CommentContext, currentLine: CommentLineDesc) {
  assert(currentContext.comment.type === 'Line', `Line ${currentLine.index} is not type "Line"`);

  const overflowReport = checkLineOverflow(currentContext, currentLine);
  if (overflowReport) {
    return overflowReport;
  }

  if (previousContext) {
    const underflowReport = checkLineUnderflow(previousContext, previousLine, currentContext,
      currentLine);
    if (underflowReport) {
      return underflowReport;
    }
  }
}
