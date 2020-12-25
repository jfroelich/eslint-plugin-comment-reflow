import eslint from 'eslint';
import { CommentContext } from './comment-context';
import { CommentLine } from './line-data';

export function checkLineOverflow(context: CommentContext, line: CommentLine) {
  const text = line.text;

  if (text.length <= context.max_line_length) {
    return;
  }

  // if there is a comment directive then never overflow

  const content = line.content;
  if (content.startsWith('eslint-')) {
    return;
  }

  if (content.startsWith('@ts-')) {
    return;
  }

  if (content.startsWith('tslint:')) {
    return;
  }

  // typescript triple slash directive

  if (/^\/\s<(reference|amd)/.test(content)) {
    return;
  }

  const lineRangeStart = context.comment.range[0];

  const edge = text.lastIndexOf(' ', context.max_line_length);

  const report: eslint.Rule.ReportDescriptor = {
    node: context.node,
    loc: context.comment.loc,
    messageId: 'overflow',
    data: {
      line_length: `${text.length}`,
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      if (edge === -1) {
        const firstOverflowingCharacter = text.charAt(context.max_line_length);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n//' : '\n// ';
        const range: eslint.AST.Range = [0, lineRangeStart + context.max_line_length];
        return fixer.insertTextAfterRange(range, insertedText);
      } else {
        const firstOverflowingCharacter = text.charAt(edge);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n//' : '\n// ';
        const range: eslint.AST.Range = [0, lineRangeStart + edge];
        return fixer.insertTextAfterRange(range, insertedText);
      }
    }
  };

  return report;
}