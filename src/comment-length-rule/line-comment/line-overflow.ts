import eslint from 'eslint';
import { CommentContext } from '../comment-context';
import { CommentLineDesc } from '../comment-line-desc';
import { findContentBreak } from '../find-content-break';

export function checkLineOverflow(context: CommentContext, line: CommentLineDesc) {
  // If the entire line, including whitespace, is less than the length then not overflow.

  if (line.text.length <= context.max_line_length) {
    return;
  }

  // If the comment only starts after the threshold, then ignore.

  if (line.lead_whitespace.length >= context.max_line_length) {
    return;
  }

  // If the content only starts after the threshold, then ignore.

  if (line.lead_whitespace.length + line.open.length + line.prefix.length >=
    context.max_line_length) {
    return;
  }

  // If the length of the line excluding the trailing whitespace is under the threshold then
  // ignore.

  if (line.lead_whitespace.length + line.open.length + line.prefix.length + line.content.length <=
    context.max_line_length) {
    return;
  }

  // if there is a comment directive then never overflow

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
