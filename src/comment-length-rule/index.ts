import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { merge } from './merge';
import { split } from './split';
import { CommentContext, CommentLine, parseLine, sniffLineBreakStyle } from './util';

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
  let finalLineCommentLine: CommentLine;

  const lineBreakStyle = sniffLineBreakStyle(ruleContext);

  for (const comment of comments) {
    const context: CommentContext = {
      node,
      code,
      line_break: lineBreakStyle,
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

        if (previousLine) {
          const report = split(previousLine, previousLine.index + 1 === line ? currentLine : null);
          if (report) {
            ruleContext.report(report);
          }
        }

        const report = merge(previousLine, currentLine);
        if (report) {
          ruleContext.report(report);
        }

        previousLine = currentLine;
      }

      // we have to call split once more for the final line of the comment

      const report = split(previousLine);
      if (report) {
        ruleContext.report(report);
      }

      previousLine = null;
    } else if (comment.type === 'Line') {
      const currentLine = parseLine(context, comment, comment.loc.start.line);

      if (previousLine) {
        const report = split(previousLine,
          previousLine.index + 1 === currentLine.index ? currentLine : null);
        if (report) {
          ruleContext.report(report);
        }
      }

      const report = merge(previousLine, currentLine);
      if (report) {
        ruleContext.report(report);
      }

      previousLine = currentLine;
      finalLineCommentLine = currentLine;
    }
  }

  // TODO: analyze at the time of visit, not at the very end. it is weird to see a bug in a long
  // line comment but not see a linting error and instead see only a linting error in some later
  // block comment.

  if (finalLineCommentLine) {
    const report = split(finalLineCommentLine);
    if (report) {
      ruleContext.report(report);
    }
  }
}
