import { checkBlockOverflow } from './block-overflow';
import { checkBlockUnderflow } from './block-underflow';
import { CommentContext } from './comment-context';
import { parseLine } from './line-data';

/**
 * Generate a fix for a block comment. This will only generate one fix when there are multiple
 * linting errors because ESLint reevaluates after each fix. Returns undefined if no error is found.
 */
export function checkBlockComment(context: CommentContext) {
  if (context.comment.type !== 'Block') {
    return;
  }

  // Do not analyze block comments that are not the first token on the line of the start of the
  // comment. A token can span multiple lines so we are looking for any token that ends on the same
  // line that the comment token starts, regardless of where the previous token started.

  const previousToken = context.code.getTokenBefore(context.comment, { includeComments: true });
  if (previousToken && previousToken.loc.end.line === context.comment.loc.start.line) {
    return;
  }

  context.in_markdown_fence = false;
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
