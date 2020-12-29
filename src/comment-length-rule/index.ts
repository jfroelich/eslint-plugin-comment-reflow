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

    if (comment.type === 'Block') {
      const blockReport = checkBlockComment(commentContext, comment);
      if (blockReport) {
        return context.report(blockReport);
      }
    } else if (comment.type === 'Line') {
      const currentLine = parseLine(code, comment, comment.loc.start.line);

      const singleLineReport = checkLineComment(commentContext, comment, previousLine, currentLine);
      if (singleLineReport) {
        return context.report(singleLineReport);
      }

      previousLine = currentLine;
    } else {
      // Ignore shebang. A shebang should only be the first comment in a file. I am unclear on
      // whether eslint even reveals it via getAllComments. In any event, we never want to check it
      // for split/merge. So we support shebang comments by properly ignoring them.
    }
  }
}

function checkBlockComment(context: CommentContext, comment: estree.Comment) {
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
