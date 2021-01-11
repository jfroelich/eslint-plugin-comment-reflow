import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { CommentLine, CommentLineGroup, parseLine, sniffLineBreakStyle } from './util';

export default <eslint.Rule.RuleModule>{
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      split: 'Line {{line}} should break at column {{column}}.',
      merge: 'Line {{line}} should be merged with previous line.'
    }
  },
  create: createCommentLengthRule
};

function createCommentLengthRule(context: eslint.Rule.RuleContext) {
  return {
    Program: function(node: estree.Node) {
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

  const lineBreakStyle = sniffLineBreakStyle(ruleContext);
  const code = ruleContext.getSourceCode();
  const comments = code.getAllComments();
  let lines: CommentLine[] = [];
  const reports: eslint.Rule.ReportDescriptor[] = [];

  const isolatedComments = findIsolatedComments(ruleContext, comments);

  for (const comment of isolatedComments) {
    if (comment.type === 'Block') {
      if (lines.length) {
        const group = <CommentLineGroup>{
          type: 'line',
          node,
          code,
          line_break: lineBreakStyle,
          max_line_length: maxLineLength,
          lines
        };
        reports.push(analyzeGroup(group));
        lines = [];
      }

      for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
        const currentLine = parseLine(code, comment, line);
        lines.push(currentLine);
      }

      const group = <CommentLineGroup>{
        type: 'block',
        node,
        code,
        line_break: lineBreakStyle,
        max_line_length: maxLineLength,
        lines
      };
      reports.push(analyzeGroup(group));
      lines = [];
    } else if (comment.type === 'Line') {
      const currentLine = parseLine(code, comment, comment.loc.start.line);
      if (lines.length === 0 || lines[lines.length -1].index + 1 === comment.loc.start.line) {
        lines.push(currentLine);
      } else {
        const group = <CommentLineGroup>{
          type: 'line',
          node,
          code,
          line_break: lineBreakStyle,
          max_line_length: maxLineLength,
          lines
        };
        reports.push(analyzeGroup(group));
        lines = [currentLine];
      }
    } else {
      // ignore shebang, and since it should only be first line, lines array is empty
    }
  }

  if (lines.length) {
    const group = <CommentLineGroup>{
      type: 'line',
      node,
      code,
      line_break: lineBreakStyle,
      max_line_length: maxLineLength,
      lines
    };
    reports.push(analyzeGroup(group));
  }

  console.log('Found %d report descriptors', reports.length);

  // todo: iterate over the reports and report each one
}

/**
 * Returns an array of comments that do not share lines with non-comment tokens.
 */
function findIsolatedComments(context: eslint.Rule.RuleContext, comments: estree.Comment[]) {
  const code = context.getSourceCode();

  return comments.filter(comment => {
    const previousToken = code.getTokenBefore(comment, { includeComments: true });
    if (previousToken && previousToken.loc.end.line === comment.loc.start.line) {
      return false;
    }

    // Only block comments can have a subsequent token on the same line.

    if (comment.type === 'Block') {
      const nextToken = code.getTokenAfter(comment, { includeComments: true });
      if (nextToken && comment.loc.end.line === nextToken.loc.start.line) {
        return false;
      }
    }

    return true;
  });
}

function analyzeGroup(group: CommentLineGroup) {
  if (!group) {
    return;
  }

  console.log('got group with type', group.type);

  return <eslint.Rule.ReportDescriptor>null;
}
