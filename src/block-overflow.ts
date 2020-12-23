import eslint from 'eslint';
import { CommentContext } from './comment-context';

export function createBlockCommentLineOverflowReport(context: CommentContext) {
  if (context.comment.type !== 'Block') {
    return;
  }

  // Get the text of the current line
  // TODO: revise so that this is const, if we want to work on altered state that should be a
  // different variable

  const text = context.code.lines[context.line - 1];

  // Detect if we are transitioning into a markdown fenced section or out of a mark down fenced
  // section.
  // TODO: this needs to be more accurate and handle cases like no asterisk, multiple fences on
  // same line, etc. is jsdoc only validate for asterisk blocks that are well formed?
  // TODO: this step seems redundant with some later logic, we probably want to do create some
  // variable that is reused in several places, the captures indent level and whether this is a
  // asterisk block and where the content starts and where the asterisk is located

  const textTrimmedStart = text.trimStart();

  if (textTrimmedStart.startsWith('* ```')) {
    context.fenced = !context.fenced;
  }

  // If we are in a markdown-fenced section then do not consider whether we overflow.

  if (context.fenced) {
    return;
  }

  // If the entire text of the line (not just the part of the line that is the comment) is less than
  // the threshold then the line does not overflow.

  if (text.length <= context.max_line_length) {
    return;
  }

  // Do not treat tslint directives as overflowing. tslint directives are expressed on a single line
  // of the block comment (at least that is what I understand). Since we could be on any line of the
  // comment, we want to check if we are on the first line of the comment. We tolerate leading
  // whitespace before the comment.
  // TODO: what about whitespace between the slash-star and the word tslint?

  if (context.line === context.comment.loc.start.line &&
    textTrimmedStart.startsWith('/* tslint:')) {
    return;
  }

  // Compute the position of the start of the current line in the whole file. The +1 is the length
  // of the line break (which might be wrong right now). This is computed starting from the start of
  // the comment. We could be on the first line of the comment or some later line. The loop is not
  // entered when we are on the first line.

  let lineRangeStart = context.comment.range[0];
  for (let line = context.comment.loc.start.line; line < context.line; line++) {
    lineRangeStart += context.code.lines[line - 1].length + 1;
  }

  // Find the last space in the line. We have to be careful to exclude the leading space following
  // an asterisk.

  let edge = -1;
  if (textTrimmedStart.startsWith('* ')) {
    edge = textTrimmedStart.slice(2).lastIndexOf(' ', context.max_line_length - 2);

    // the slice wreaks some havoc on the offset
    if (edge + 3 > context.max_line_length) {
      edge = context.max_line_length;
    } else if (edge !== -1) {
      edge = edge + 3;
    }
  } else {
    edge = textTrimmedStart.lastIndexOf(' ', context.max_line_length);
  }

  // Compute the range of the text after which we will insert some new text.

  let insertAfterRange: eslint.AST.Range;
  if (edge === -1) {
    insertAfterRange = [0, lineRangeStart + context.max_line_length];
  } else {
    insertAfterRange = [0, lineRangeStart + edge];
  }

  // Build the text to insert.

  const firstOverflowingCharacter = edge === -1 ?
    text.charAt(context.max_line_length) : text.charAt(edge);
  const textToInsert = firstOverflowingCharacter === ' ' ? '\n*' : '\n* ';

  return <eslint.Rule.ReportDescriptor>{
    node: context.node,
    loc: context.comment.loc,
    messageId: 'overflow',
    data: {
      line_length: `${text.length}`,
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.insertTextAfterRange(insertAfterRange, textToInsert);
    }
  };
}