import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { CommentLine, CommentLineGroup, parseLine } from './util';

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
    Program: function(/*node: estree.Node*/) {
      return analyzeProgram(context/*, node*/);
    }
  };
}

function analyzeProgram(ruleContext: eslint.Rule.RuleContext/*, node: estree.Node*/) {
  let maxLineLength = 80;
  if (ruleContext.options && ruleContext.options.length) {
    maxLineLength = <number>ruleContext.options[0];
  }

  assert(Number.isInteger(maxLineLength), 'Invalid option for maximum line length');

  const code = ruleContext.getSourceCode();
  const comments = code.getAllComments();
  const candidates = findCandidateComments(ruleContext, comments);
  const groups = findCommentGroups(ruleContext, candidates);

  for (const group of groups) {
    console.log('group starts on line %d and ends on line %d (%d lines)',
      group.lines[0].comment.loc.start.line,
      group.lines[group.lines.length -1].comment.loc.end.line,
      group.lines.length);
  }

  // TODO: analyze the groups and generate reports
  // const lineBreakStyle = sniffLineBreakStyle(ruleContext);

  // TODO: iterate over the reports and report each one
  //   const reports: eslint.Rule.ReportDescriptor[] = [];
}

/**
 * Returns an array of comments that do not share lines with non-comment tokens.
 */
function findCandidateComments(context: eslint.Rule.RuleContext, comments: estree.Comment[]) {
  const code = context.getSourceCode();

  return comments.filter(comment => {
    // ignore shebang
    if (comment.type !== 'Block' && comment.type !== 'Line') {
      return false;
    }

    // ignore comments where another token precedes on same line

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

/**
 * Scans the comments array and aggregates comments into groups. Block comments represent 1 group.
 * Sequential line comments represent 1 group.
 *
 * This assumes that comments are the only token on the line. Filtered comments serve as delimiters
 * of line comments because of the subsequent-line check so there is no risk of swallowing them.
 *
 * This assumes shebang-type comments not present in input comments.
 *
 * @returns an array of groups
 */
export function findCommentGroups(context: eslint.Rule.RuleContext, comments: estree.Comment[]) {
  const code = context.getSourceCode();
  const groups: Partial<CommentLineGroup>[] = [];
  let buffer: CommentLine[] = [];

  for (const comment of comments) {
    if (comment.type === 'Block') {
      if (buffer.length) {
        groups.push({ type: 'line', lines: buffer });
        buffer = [];
      }

      for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
        buffer.push(parseLine(code, comment, line));
      }

      groups.push({ type: 'block', lines: buffer });
      buffer = [];
    } else if (comment.type === 'Line') {
      const currentLine = parseLine(code, comment, comment.loc.start.line);
      if (buffer.length === 0 || buffer[buffer.length - 1].index + 1 === currentLine.index) {
        buffer.push(currentLine);
      } else {
        groups.push({ type: 'line', lines: buffer });
        buffer = [currentLine];
      }
    }
  }

  if (buffer.length) {
    groups.push({ type: 'line', lines: buffer });
  }

  return groups;
}
