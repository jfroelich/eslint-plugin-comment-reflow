import { CommentContext } from '../comment-context';
import { CommentLine } from '../comment-line';
import { parseLine } from "../parse-line";
import { checkBlockOverflow } from './block-overflow';
import { checkBlockUnderflow } from './block-underflow';

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

  const nextToken = context.code.getTokenAfter(context.comment, { includeComments: true });
  if (nextToken && context.comment.loc.end.line === nextToken.loc.start.line) {
    return;
  }

  context.in_md_fence = false;
  context.in_jsdoc_example = false;

  for (let loc = context.comment.loc, line = loc.start.line, previousLine: CommentLine;
    line <= loc.end.line; line++) {
    const currentLine = parseLine(context.code, context.comment, line);

    let report = checkBlockOverflow(context, currentLine);
    if (report) {
      return report;
    }

    if (previousLine) {
      report = checkBlockUnderflow(context, previousLine, currentLine);
      if (report) {
        return report;
      }
    }

    previousLine = currentLine;
  }
}
