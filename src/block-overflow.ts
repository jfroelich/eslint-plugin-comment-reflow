import eslint from 'eslint';
import { CommentContext } from './comment-context';

export function createBlockCommentLineOverflowReport(context: CommentContext) {
  if (context.comment.type !== 'Block') {
    return;
  }

  // Obtain the previous token. Block comments are tokens of type Block. If the comment is the start
  // of the file or all characters from the start of the file to the comment are whitespace, then
  // there is no previous token.

  // TODO: this is evaluated per line, but it seems like it would make more sense to evaluate it
  // once per comment? But that would mean this whole setup is wrong. I think the for loop might
  // need to get more complicated if we want to optimize. Like, instead of going straight to line
  // iteration, we call out to a block or line helper for the entire comment. each helper is
  // separately responsible for doing the line iteration along with any other kinds of extra work
  // it wants to do.

  const previousToken = context.code.getTokenBefore(context.comment, { includeComments: true });

  // Bail when there is a previous token on the same line.
  // TODO: support trailing comments

  if (previousToken && previousToken.loc.end.line === context.comment.loc.start.line) {
    console.debug('detected trailing block comment, exiting overflow analysis');
    return;
  }

  // Determine if the current line of this comment is the first line of the comment and if it is
  // not the first token on the line. Since whitespace is unfortunately not tokenized

  // Get the text of the current line. The line is 1-based but the index of the line in the lines
  // array is 0 based. The text does not include line break characters. The text may include
  // characters that are not a part of the comment. The text includes the comment syntax.

  const text = context.code.lines[context.line - 1];

  // If the text of the line, less its line break characters, is less than the threshold then the
  // line does not overflow. We want to check this as early as possible and exit as fast as
  // possible. Keep in mind that this counts tab characters as a single character.

  if (text.length <= context.max_line_length) {
    return;
  }

  // TODO: we cannot assume that the comment is the start of the line. We have to detect if we are
  // in a trailing context here. Maybe for now we shouldn't even handle trailing comments and at
  // least do nothing instead of doing something strange.

  const textTrimmedStart = text.trimStart();

  // Detect if we are transitioning into a markdown fenced section or out of a mark down fenced
  // section.
  // TODO: this needs to be more accurate and handle cases like no asterisk, multiple fences on
  // same line, etc. is jsdoc only validate for asterisk blocks that are well formed?
  // TODO: this step seems redundant with some later logic, we probably want to do create some
  // variable that is reused in several places, the captures indent level and whether this is a
  // asterisk block and where the content starts and where the asterisk is located

  if (textTrimmedStart.startsWith('* ```')) {
    context.fenced = !context.fenced;
  }

  // If we are in a markdown-fenced section then do not consider whether we overflow.

  if (context.fenced) {
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

  // TODO: take another look at code.getIndexFromLoc. I think we can use line number with column 0
  // to obtain the line range start instead of computing it ourselves. Look at the source code of
  // eslint for documentation.

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
  // TODO: look at getIndexFromLoc

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