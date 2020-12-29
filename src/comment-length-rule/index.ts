import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { CommentContext } from './comment-context';
import { CommentLine } from './comment-line';
import { merge } from './merge';
import { parseLine } from './parse-line';
import { split } from './split';

export const commentLengthRule: eslint.Rule.RuleModule = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      split: 'Comment line should be split',
      merge: 'Comment lines should be merged'
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
  let previousSingleLine: CommentLine;

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

        let report = split(commentContext, comment, currentLine);
        if (report) {
          return context.report(report);
        }

        if (previousLine) {
          report = merge(commentContext, comment.type, previousLine, currentLine);
          if (report) {
            return context.report(report);
          }
        }

        previousLine = currentLine;
      }
     } else if (comment.type === 'Line') {
      const currentLine = parseLine(code, comment, comment.loc.start.line);

      let report = split(commentContext, comment, currentLine);
      if (report) {
        return context.report(report);
      }

      if (previousSingleLine) {
        report = merge(commentContext, comment.type, previousSingleLine, currentLine);
        if (report) {
          return context.report(report);
        }
      }

      previousSingleLine = currentLine;
    }
  }
}
