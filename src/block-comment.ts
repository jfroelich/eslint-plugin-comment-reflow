import { checkBlockOverflow } from './block-overflow';
import { checkBlockUnderflow } from './block-underflow';
import { CommentContext } from './comment-context';
import { parseLine } from './line-data';

/**
 * Generate a fix for the first error found in block comment.
 */
export function checkBlockComment(context: CommentContext) {
  if (context.comment.type !== 'Block') {
    return;
  }

  // Ignore comments that are not the first token on the line.

  const previousToken = context.code.getTokenBefore(context.comment, { includeComments: true });
  if (previousToken && previousToken.loc.end.line === context.comment.loc.start.line) {
    return;
  }

  context.in_md_fence = false;
  context.in_jsdoc_example = false;

  for (let loc = context.comment.loc, line = loc.start.line; line <= loc.end.line; line++) {
    const commentLine = parseLine(context.code, context.comment, line);

    let report = checkBlockOverflow(context, commentLine);
    if (report) {
      return report;
    }

    report = checkBlockUnderflow(context, commentLine);
    if (report) {
      return report;
    }
  }
}
