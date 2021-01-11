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

  const isolatedComments = findCandidateComments(ruleContext, comments);
  const groups = findCommentGroups(ruleContext, isolatedComments);

  console.log(groups);

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
 * Scans the incoming array and aggregates comments into groups. Block comments represent 1 group.
 * Sequential line comments represent 1 group.
 *
 * This assumes that comments are the only token on the line.
 *
 * @todo maybe eagerly parsing is bad if we do not always use all the lines? i like maintaining the
 * link to the comment of the line though.
 */
export function findCommentGroups(context: eslint.Rule.RuleContext, comments: estree.Comment[]) {
  const code = context.getSourceCode();
  const groups: Partial<CommentLineGroup>[] = [];
  let lines: CommentLine[] = [];

  for (const comment of comments) {
    if (comment.type === 'Block') {
      if (lines.length) {
        groups.push({ type: 'line', lines });
        lines = [];
      }

      for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
        const currentLine = parseLine(code, comment, line);
        lines.push(currentLine);
      }

      groups.push({ type: 'block', lines });
      lines = [];
    } else if (comment.type === 'Line') {
      const currentLine = parseLine(code, comment, comment.loc.start.line);

      // when there is no previous line comment, append to buffer. when the current line is
      // immediately subsequent to the previous line, append to buffer. otherwise, there are
      // distinct groups of line comments, so flush the current buffer and start anew.
      if (lines.length === 0 || lines[lines.length -1].index + 1 === comment.loc.start.line) {
        lines.push(currentLine);
      } else {
        groups.push({ type: 'line', lines });
        lines = [currentLine];
      }
    } else {
      // ignore shebang
    }
  }

  // Due to the how the iteration is structured, we have to account for the final buffer of lines at
  // the end.

  if (lines.length) {
    groups.push({ type: 'line', lines });
  }

  return groups;
}
