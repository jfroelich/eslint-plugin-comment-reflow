import eslint from 'eslint';
import { CommentContext } from '../comment-context';
import { CommentLine } from '../comment-line';
import { findContentBreak } from '../find-content-break';

export function checkLineOverflow(context: CommentContext, line: CommentLine) {
  // If the entire line, including trailing whitespace in case the trailing whitespace rule is off,
  // is less than the threshold then do not detect overflow.

  if (line.text.length <= context.max_line_length) {
    return;
  }

  // If the comment's opening starts after the threshold then do not detect overflow.

  if (line.lead_whitespace.length >= context.max_line_length) {
    return;
  }

  // If the comment's prefix starts after the threshold then do not detect overflow.

  if (line.lead_whitespace.length + line.open.length >= context.max_line_length) {
    return;
  }

  // If the comment's content starts after the threshold then do not detect overflow.

  if (line.lead_whitespace.length + line.open.length + line.prefix.length >=
    context.max_line_length) {
    return;
  }

  // If the length of the line up to the end of the content, which excludes trailing whitespace, is
  // under the threshold then do not detect overflow.

  if (line.lead_whitespace.length + line.open.length + line.prefix.length + line.content.length <=
    context.max_line_length) {
    return;
  }

  // If there is a comment directive then never overflow

  if (line.content.startsWith('eslint-')) {
    return;
  }

  // TODO: this might not work, is this in prefix?

  if (line.content.startsWith('@ts-')) {
    return;
  }

  if (line.content.startsWith('tslint:')) {
    return;
  }

  // typescript triple slash directive

  if (/^\/\s<(reference|amd)/.test(line.content)) {
    return;
  }

  const contentBreakPosition = findContentBreak(line, context.max_line_length);

  const lineBreakPosition = contentBreakPosition > 0 ?
    contentBreakPosition :
    context.max_line_length;

  const lineStartIndex = context.code.getIndexFromLoc({ line: line.index, column: 0 });
  const insertAfterRange: eslint.AST.Range = [0, lineStartIndex + lineBreakPosition];

  let textToInsert = '\n';
  textToInsert += line.text.slice(0, line.lead_whitespace.length);
  textToInsert += '//';
  textToInsert += line.prefix + ''.padEnd(line.markup.length + line.markup_space.length);

  return <eslint.Rule.ReportDescriptor>{
    node: context.node,
    loc: {
      start: {
        line: line.index,
        column: 0
      },
      end: {
        line: line.index,
        column: line.text.length
      }
    },
    messageId: 'overflow',
    data: {
      line_length: `${line.text.length}`,
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.insertTextAfterRange(insertAfterRange, textToInsert);
    }
  };
}
