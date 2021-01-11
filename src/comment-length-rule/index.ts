import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { CommentLine, CommentLineGroup, parseLine, sniffLineBreakStyle } from './util';

export default <eslint.Rule.RuleModule>{
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      reflow: 'Comment(s) starting on {{line}} needs reflow.'
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
  const candidates = comments.filter(isCandidateComment, ruleContext);
  const groups = findCommentGroups(ruleContext, candidates);
  const descriptors = analyzeGroups(ruleContext, groups);
  descriptors.forEach(descriptor => ruleContext.report(descriptor));
}

function isCandidateComment(this: eslint.Rule.RuleContext, comment: estree.Comment) {
  if (comment.type !== 'Block' && comment.type !== 'Line') {
    return false;
  }

  const code = this.getSourceCode();
  const token = code.getTokenBefore(comment, { includeComments: true });
  if (token && token.loc.end.line === comment.loc.start.line) {
    return false;
  }

  if (comment.type === 'Block') {
    const token = code.getTokenAfter(comment, { includeComments: true });
    if (token && comment.loc.end.line === token.loc.start.line) {
      return false;
    }
  }

  return true;
}

function findCommentGroups(context: eslint.Rule.RuleContext, comments: estree.Comment[]) {
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

  return <CommentLineGroup[]>groups;
}

export function analyzeGroups(ruleContext: eslint.Rule.RuleContext, groups: CommentLineGroup[]) {
  const lineBreakStyle = sniffLineBreakStyle(ruleContext);
  console.log('line break "%s"', lineBreakStyle.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));

  const reports: eslint.Rule.ReportDescriptor[] = [];
  for (const group of groups) {
    const report = analyzeGroup(group);
    if (report) {
      reports.push(report);
    }
  }
  return reports;
}

function analyzeGroup(group: CommentLineGroup) {
  console.log('group starts on line %d and ends on line %d (%d lines)',
    group.lines[0].comment.loc.start.line,
    group.lines[group.lines.length -1].comment.loc.end.line,
    group.lines.length);

  const descriptor: eslint.Rule.ReportDescriptor = null;
  return descriptor;
}
