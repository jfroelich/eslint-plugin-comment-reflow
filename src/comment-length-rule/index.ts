import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { checkBlockOverflow } from './block-overflow';
import { checkBlockUnderflow } from './block-underflow';
import { CommentContext } from './comment-context';
import { CommentLine } from './comment-line';
import { checkLineOverflow } from './line-overflow';
import { checkLineUnderflow } from './line-underflow';
import { parseLine } from './parse-line';

export const commentLengthRule: eslint.Rule.RuleModule = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      overflow: 'Comment line should wrap',
      underflow: 'Comment lines should be merged'
    }
  },
  create: createCommentLengthRule
};

function createCommentLengthRule(context: eslint.Rule.RuleContext) {
  return {
    Program(node: estree.Node) {
      return analyzeProgram(context, node);
    }
  };
}

function analyzeProgram(context: eslint.Rule.RuleContext, node: estree.Node) {
  let maxLineLength = 80;
  if (context.options && context.options.length) {
    maxLineLength = <number>context.options[0];
  }

  assert(Number.isInteger(maxLineLength), 'Invalid option for maximum line length');

  const code = context.getSourceCode();
  const comments = code.getAllComments();
  let previousLine: CommentLine;

  for (const comment of comments) {
    const commentContext: CommentContext = {
      node,
      code,
      max_line_length: maxLineLength
    };

    const previousToken = code.getTokenBefore(comment, { includeComments: true });
    if (previousToken && previousToken.loc.end.line === comment.loc.start.line) {
      continue;
    }

    const nextToken = code.getTokenAfter(comment, { includeComments: true });
    if (nextToken && comment.loc.end.line === nextToken.loc.start.line) {
      continue;
    }

    if (comment.type === 'Block') {
      commentContext.in_md_fence = false;
      commentContext.in_jsdoc_example = false;
      const loc = comment.loc;

      for (let line = loc.start.line, previousLine: CommentLine; line <= loc.end.line; line++) {
        const currentLine = parseLine(commentContext.code, comment, line);

        let report = checkBlockOverflow(commentContext, comment, currentLine);
        if (report) {
          return report;
        }

        if (previousLine) {
          report = checkBlockUnderflow(commentContext, previousLine, currentLine);
          if (report) {
            return report;
          }
        }

        previousLine = currentLine;
      }
     } else if (comment.type === 'Line') {
      const currentLine = parseLine(code, comment, comment.loc.start.line);

      const report = checkLineComment(commentContext, comment, previousLine, currentLine);
      if (report) {
        return context.report(report);
      }

      previousLine = currentLine;
    } else {
      // Ignore shebang. A shebang should only be the first comment in a file. I am unclear on
      // whether eslint even reveals it via getAllComments. In any event, we never want to check it
      // for split/merge. So we support shebang comments by properly ignoring them.
    }
  }
}

function checkLineComment(context: CommentContext, comment: estree.Comment,
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
