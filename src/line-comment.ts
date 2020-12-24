import { CommentContext } from './comment-context';
import { createLineCommentLineOverflowReport } from './line-overflow';
import { createLineCommentLineUnderflowReport } from './line-underflow';

/**
 * Generate a fix for single line comment
 */
export function createLineCommentReport(context: CommentContext) {
  if (context.comment.type !== 'Line') {
    return;
  }

  const report = createLineCommentLineOverflowReport(context);
  if (report) {
    return report;
  }

  return createLineCommentLineUnderflowReport(context);
}