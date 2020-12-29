import type estree from 'estree';
import { checkBlockOverflow } from './block-overflow';
import { checkBlockUnderflow } from './block-underflow';
import { CommentContext } from './comment-context';
import { CommentLine } from './comment-line';
import { parseLine } from "./parse-line";

/**
 * Generate a fix for the first error found in block comment.
 */
export function checkBlockComment(context: CommentContext, comment: estree.Comment) {
  const previousToken = context.code.getTokenBefore(comment, { includeComments: true });
  if (previousToken && previousToken.loc.end.line === comment.loc.start.line) {
    return;
  }

  const nextToken = context.code.getTokenAfter(comment, { includeComments: true });
  if (nextToken && comment.loc.end.line === nextToken.loc.start.line) {
    return;
  }

  context.in_md_fence = false;
  context.in_jsdoc_example = false;

  for (let loc = comment.loc, line = loc.start.line, previousLine: CommentLine;
    line <= loc.end.line; line++) {
    const currentLine = parseLine(context.code, comment, line);

    let report = checkBlockOverflow(context, comment, currentLine);
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
