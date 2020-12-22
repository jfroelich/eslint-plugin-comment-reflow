import eslint from 'eslint';
import { CommentContext } from './comment-context';

export function createBlockCommentLineOverflowReport(context: CommentContext) {
  if (context.comment.type !== 'Block') {
    return;
  }

  if (context.fenced) {
    return;
  }

  let text = context.code.lines[context.line - 1];
  if (text.length <= context.max_line_length) {
    return;
  }

  text = text.trimStart();

  // Do not treat tslint directives as overflowing

  if (context.line === context.comment.loc.start.line && text.startsWith('/* tslint:')) {
    return;
  }

  // Find the last space in the line. We have to be careful to exclude the leading space following 
  // an asterisk.

  let edge = -1;
  if (text.startsWith('* ')) {
    edge = text.slice(2).lastIndexOf(' ', context.max_line_length - 2);

    // the slice wreaks some havoc on the offset
    if (edge + 3 > context.max_line_length) {
      edge = context.max_line_length;
    } else if (edge !== -1) {
      edge = edge + 3;
    }
  } else {
    // we trimmed left. we are starting with * or whatever is first text.
    edge = text.lastIndexOf(' ', context.max_line_length);
  }

  const report: eslint.Rule.ReportDescriptor = {
    node: context.node,
    loc: context.comment.loc,
    messageId: 'overflow',
    data: {
      line_length: `${text.length}`,
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      const text = context.code.lines[context.line - 1];
      if (edge === -1) {
        const firstOverflowingCharacter = text.charAt(context.max_line_length);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n*' : '\n* ';
        return fixer.insertTextAfterRange([0, context.line_range_start + context.max_line_length], 
          insertedText);
      } else {
        const firstOverflowingCharacter = text.charAt(edge);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n*' : '\n* ';
        return fixer.insertTextAfterRange([0, context.line_range_start + edge], insertedText);
      }
    }
  };

  return report;
}