import { createBlockCommentLineOverflowReport } from './block-overflow';
import { createBlockCommentLineUnderflowReport } from './block-underflow';
import { CommentContext } from './comment-context';

/**
 * Generate a fix for a block comment. This will only generate one fix when there are multiple
 * linting errors because ESLint reevaluates after each fix. Returns undefined if no error is found.
 */
export function createBlockCommentReport(context: CommentContext) {
  if (context.comment.type !== 'Block') {
    return;
  }

  context.in_markdown_fence = false;
  context.in_jsdoc_example = false;

  // Do not analyze block comments that are not the first token on the line of the start of the
  // comment. I do want to support this eventually but it is more complicated and so for now I want
  // to focus on getting other things correct. Although the documentation is confusing, it looks
  // like comments are tokens and therefore we can use the utility functions from SourceCode to
  // process them like any other kind of token, even though comments are not in the AST.

  // A token can span multiple lines. So we are looking for any token that ends on the same line
  // that the comment token starts, regardless of where the previous token started. I am not totally
  // clear on whether ESLint properly sets the end position of all tokens but I believe it does? We
  // could do something like "try end and fallback to start" if this doesn't work out.

  const previousToken = context.code.getTokenBefore(context.comment, { includeComments: true });
  if (previousToken && previousToken.loc.end.line === context.comment.loc.start.line) {
    return;
  }

  // Check each line for overflow or underflow. The fact that line numbers are 1-based doesn't
  // matter, the iteration works just like 0-based.

  const location = context.comment.loc;
  for (let line = location.start.line; line <= location.end.line; line++) {
    context.line = line;

    let report = createBlockCommentLineOverflowReport(context);
    if (report) {
      return report;
    }

    report = createBlockCommentLineUnderflowReport(context);
    if (report) {
      return report;
    }
  }
}