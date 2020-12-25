import { createBlockCommentLineOverflowReport } from './block-overflow';
import { createBlockCommentLineUnderflowReport } from './block-underflow';
import { CommentContext } from './comment-context';
import { parseBlockCommentLine } from './parse-block-comment-line';

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
  // comment. A token can span multiple lines so we are looking for any token that ends on the same
  // line that the comment token starts, regardless of where the previous token started.

  const previousToken = context.code.getTokenBefore(context.comment, { includeComments: true });
  if (previousToken && previousToken.loc.end.line === context.comment.loc.start.line) {
    return;
  }

  // Parse and check each line for overflow or underflow.

  // TODO: line does not belong in context, it should be passed along as a separate parameter.
  // TODO: the misc. line props do not belong in context, they belong in a second parameter to the
  // helpers

  for (let loc = context.comment.loc, line = loc.start.line; line <= loc.end.line; line++) {
    context.line = line;

    const lineData = parseBlockCommentLine(context.code, context.comment, line);
    context.line_text = lineData.text;
    context.line_text_trimmed_start = lineData.text_trimmed_start;
    context.line_prefix = lineData.prefix;
    context.line_content = lineData.content;

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
