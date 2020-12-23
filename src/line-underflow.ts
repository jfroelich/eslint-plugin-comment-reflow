import assert from 'assert';
import eslint from 'eslint';
import { CommentContext } from './comment-context';

export function createLineCommentLineUnderflowReport(context: CommentContext) {
  if (context.comment.type !== 'Line') {
    return;
  }

  // Get the text of the line. Do not confuse this with comment value. line is 1 based so we 
  // subtract 1 to get the line in the lines array.

  const text = context.code.lines[context.line - 1];

  // The comment line only underflows when it is less than the maximum line length.

  if (text.length >= context.max_line_length) {
    return;
  }

  // We must consider that eslint stripped out the line break from the text. Therefore, if we count 
  // the line break character itself, and we are right at the threshold, this is not underflow.
  if (text.length + 1 === context.max_line_length) {
    return;
  }

  // For a single line comment line to underflow, it cannot be the final comment in the file.
  const comments = context.code.getAllComments();
  if (context.comment_index + 1 === comments.length) {
    return;
  }

  // For a single line comment line to underflow, it must have some content other than the leading 
  // comment syntax.

  const trimmedText = text.trim();
  if (trimmedText === '//') {
    return;
  }

  // If the current single line comment is an eslint pragma kind of comment then never consider it 
  // to underflow.

  const content = trimmedText.slice(2).trimStart();

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

  // We know this comment is not the final comment. Examine the next comment.

  const next = comments[context.comment_index + 1];

  // For a single line comment line to underflow, there must be a subsequent single line comment
  // line. The comments array contains block and single line comments mixed together. If the next
  // comment is not a single line comment then there is a break that prevents merging. We do not
  // merge single lines with blocks.

  if (next.type !== 'Line') {
    return;
  }

  // For a single line comment to underflow, the next comment must be immediately adjacent to the 
  // current comment. Recall that we are iterating over an array of comments that may be spread out 
  // all over the lines array, so the next comment is not guaranteed adjacent. The next comment is 
  // considered adjacent if the difference between the current line number and the next comment's 
  // line number is 1. We could use comment.loc.end.line or line here.

  if (next.loc.start.line - context.line !== 1) {
    return;
  }

  // Get the text of the next comment line. Line is offset-1, so we just get the text at line.

  const nextCommentLineText = context.code.lines[context.line];

  // Find where the comment starts. We cannot assume the comment is at the start of the line as it 
  // could be a trailing comment. We search from the left because we want the first set of slashes, 
  // as any extra slashes are part of the comment's value itself.

  const commentStartPosition = nextCommentLineText.indexOf('//');

  // This should never happen. ESLint told us we have a single line comment.

  assert(commentStartPosition !== -1, `Invalid comment line "${nextCommentLineText}"`);

  // Grab the content of the comment without the text leading up the comment and without the double 
  // forward slashes.

  const nextContent = nextCommentLineText.slice(commentStartPosition + 2);

  // For the current line to underflow, the next line has to have some content other than the 
  // comment syntax or else we assume the author wants to prevent merging, such as forcing a new 
  // paragraph.

  if (!nextContent) {
    return;
  }
  
  const nextContentLeftTrimmed = nextContent.trimStart();

  // For the current line to underflow, the next line has to have some content other than comment 
  // syntax and also other than just whitespace.

  if (!nextContentLeftTrimmed) {
    return;
  }

  // If there is an lint pragma on the next line, then deem the current line to not underflow,
  // because the next line should not be merged. Recall that here we are working with the comment
  // value, not the line text. The comment value already removed the '//'.

  if (nextContentLeftTrimmed.startsWith('eslint-')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('@ts-')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('tslint:')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('TODO:')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('WARN:')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('HACK:')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('TODO(')) {
    return;
  }

  // To support word wrap, we want to consider whether the next line can be merged into the current 
  // line based on whether the first word or two will fit. So we want to find the maximum number of 
  // tokens we can grab from the next line and merge into the current line. At the moment this is 
  // rudimentary and looking at just one token at a time, but I will eventually improve this. So, 
  // in order to find the first word break, we want to search for the break, but starting from a 
  // position that excludes the initial leading whitespace in the next line comment content. To 
  // exclude that leading whitespace we first have to measure the number of leading whitespace 
  // characters.

  const leadingSpaceCount = nextContent.length - nextContentLeftTrimmed.length;

  // Look for the offset of the first word break in the next line content, starting from the 
  // position after the leading whitespace.

  const edge = nextContent.indexOf(' ', leadingSpaceCount);

  // If there is no intermediate whitespace in the next line then the entire next line needs to be
  // able to merged with the current line. We simply need to add it the length of the current
  // line. If the sum of the two is greater than the total preferred text length per line, then we
  // treat the current line as not underflowing.

  if (edge === -1 && nextContent.length + text.length > context.max_line_length) {
    return;
  }

  // If there is a space in the next line, check if the characters preceding that space can be added
  // to the current line text. If shifting the characters would cause the current line to overflow,
  // then the current line is not considered underflow.

  if (edge !== -1 && edge + text.length > context.max_line_length) {
    return;
  }

  const report: eslint.Rule.ReportDescriptor = {
    node: context.node,
    loc: context.comment.loc,
    messageId: 'underflow',
    data: {
      line_length: `${text.length}`,
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      const adjustment = edge === -1 ? 2 : 3;
      const range: eslint.AST.Range = [
        // TODO: this feels wrong, this assumes comment starts at start of line?
        context.comment.range[0] + context.code.lines[context.line - 1].length,
        context.comment.range[0] + context.code.lines[context.line - 1].length + 1 + 
          context.code.lines[context.line].indexOf('//') + adjustment
      ];

      return fixer.replaceTextRange(range, ' ');
    }
  };

  return report;
}
