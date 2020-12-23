import eslint from 'eslint';
import { CommentContext } from './comment-context';

export function createBlockCommentLineOverflowReport(context: CommentContext) {
  if (context.comment.type !== 'Block') {
    return;
  }

  // Get the text of the current line
  // TODO: revise so that this is const, if we want to work on altered state that should be a 
  // different variable

  let text = context.code.lines[context.line - 1];

  // Detect if we are transitioning into a markdown fenced section or out of a mark down fenced 
  // section.
  // TODO: this needs to be more accurate and handle cases like no asterisk, multiple fences on 
  // same line, etc. is jsdoc only validate for asterisk blocks that are well formed?
  // TODO: this step seems redundant with some later logic, we probably want to do create some 
  // variable that is reused in several places, the captures indent level and whether this is a 
  // asterisk block and where the content starts and where the asterisk is located

  if (text.trimStart().startsWith('* ```')) {
    context.fenced = !context.fenced;
  }

  // If we are in a markdown-fenced section then do not consider whether we overflow.  

  if (context.fenced) {
    return;
  }

  if (text.length <= context.max_line_length) {
    return;
  }

  text = text.trimStart();

  // Do not treat tslint directives as overflowing

  if (context.line === context.comment.loc.start.line && text.startsWith('/* tslint:')) {
    return;
  }

  // Compute the position of the start of the current line in the whole file. The +1 is the length 
  // of the line break (which might be wrong right now).

  let lineRangeStart = context.comment.range[0];
  for (let line = context.comment.loc.start.line; line < context.line; line++) {
    lineRangeStart += context.code.lines[line - 1].length + 1;
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
        const range: eslint.AST.Range = [
          0,
          lineRangeStart + context.max_line_length
        ];

        return fixer.insertTextAfterRange(range, insertedText);
      } else {
        const firstOverflowingCharacter = text.charAt(edge);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n*' : '\n* ';
        const range: eslint.AST.Range = [
          0,
          lineRangeStart + edge
        ];
        return fixer.insertTextAfterRange(range, insertedText);
      }
    }
  };

  return report;
}