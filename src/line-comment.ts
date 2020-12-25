import { CommentContext } from './comment-context';
import { parseLine } from './line-data';
import { createLineCommentLineOverflowReport } from './line-overflow';
import { createLineCommentLineUnderflowReport } from './line-underflow';

/**
 * Generate a fix for single line comment
 */
export function checkLineComment(context: CommentContext) {
  if (context.comment.type !== 'Line') {
    return;
  }

  const line = parseLine(context.code, context.comment, context.comment.loc.start.line);

  const report = createLineCommentLineOverflowReport(context, line);
  if (report) {
    return report;
  }

  return createLineCommentLineUnderflowReport(context, line);
}