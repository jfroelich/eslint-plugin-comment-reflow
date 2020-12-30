import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { merge } from './merge';
import { split } from './split';
import { CommentContext, CommentLine, parseLine } from './util';

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

function analyzeProgram(ruleContext: eslint.Rule.RuleContext, node: estree.Node) {
  let maxLineLength = 80;
  if (ruleContext.options && ruleContext.options.length) {
    maxLineLength = <number>ruleContext.options[0];
  }

  assert(Number.isInteger(maxLineLength), 'Invalid option for maximum line length');

  const code = ruleContext.getSourceCode();
  const comments = code.getAllComments();
  let previousLine: CommentLine;

  for (const comment of comments) {
    const context: CommentContext = {
      node,
      code,
      max_line_length: maxLineLength,
      in_md_fence: false,
      in_jsdoc_example: false
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
      previousLine = null;

      for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
        const currentLine = parseLine(context, comment, line);

        let report = split(context, currentLine);
        if (report) {
          return ruleContext.report(report);
        }

        if (previousLine) {
          report = merge(context, previousLine, currentLine);
          if (report) {
            return ruleContext.report(report);
          }
        }

        previousLine = currentLine;
      }

      previousLine = null;
     } else if (comment.type === 'Line') {
      const currentLine = parseLine(context, comment, comment.loc.start.line);

      let report = split(context, currentLine);
      if (report) {
        return ruleContext.report(report);
      }

      if (previousLine) {
        report = merge(context, previousLine, currentLine);
        if (report) {
          return ruleContext.report(report);
        }
      }

      previousLine = currentLine;
    }
  }
}
