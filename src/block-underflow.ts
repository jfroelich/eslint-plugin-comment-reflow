import eslint from 'eslint';
import estree from 'estree';

export function createBlockCommentLineUnderflowReport(node: estree.Node, code: eslint.SourceCode, 
  comment: estree.Comment, line: number, maxLineLength: number, fenced: boolean,
  lineRangeStart: number) {
  // Since the logic for handling block and single line comments varies, I figured it would be
  // better to have a helper for each type of comment. But the caller does not know which type of
  // comment they are dealing with, and I do not want to have the caller have the burden to know, so
  // we wait to test the type here.

  if (comment.type !== 'Block') {
    return;
  }

  if (fenced) {
    return;
  }

  // The current line can only underflow when there is a subsequent line. If the current line is the
  // final line of the comment then the current line cannot underflow.

  if (line === comment.loc.end.line) {
    return;
  }

  // Grab the text of the current line. Since the line number is 1-based, but the lines array is
  // 0-based, we must substract one. Do not confuse the value of the line with the comment's value.
  // Also, it looks like ESLint splits by line break to generate the lines array so each line does
  // not include surrounding line breaks so keep in mind that the length of each line is not its
  // actual length. In the case of a block comment, ESLint does not remove leading asterisks, which
  // is different behavior than single line comments, so also watch out for that.

  const text = code.lines[line - 1];

  // If the text length is greater than or equal to the maximum then this is not an underflow. It is
  // possibly overflow, but that is a separate concern.

  if (text.length >= maxLineLength) {
    return;
  }

  // ESLint stripped the line break character(s) from the text. When we consider the length of the 
  // line, we have to consider its line break. If the final character is the line break, then we 
  // actually want 1 before the threshold. Here we are using 1 for line feed, assuming no carriage 
  // return for now. I could merge this with the previous condition but I want to keep it clear for 
  // now.

  if (text.length + 1 === maxLineLength) {
    return;
  }

  // Underflow can only occur if there is content on the current line of the comment. If the line is
  // the initial line of the block comment and does not contain content, or some intermediate
  // line that does not contain content, then do not consider it to underflow.

  const trimmedText = text.trim();
  if (trimmedText === '/*' || trimmedText === '/**' || trimmedText === '*' || trimmedText === '') {
    return;
  }

  // Special handling for jslint directives. According to the docs, the directives can only be
  // specified correctly on the first line of the file, and there cannot be a space between the
  // asterisk and the directive word. In this case the directive itself should not be deemed to 
  // underflow.

  if (line === 1 && /^\/\*(global|jslint|property)/.test(text)) {
    return;
  }

  // If we are not fenced, and the current line is the fence terminator, then the current line 
  // should not be considered underflow.
  if (trimmedText.startsWith('* ```')) {
    return;
  }

  // Get the value of the next line. line is 1-based, so the next line is simply at "line".

  let next = code.lines[line];
  next = next.trim();

  // Underflow can only occur if the next line has some content that we would want to merge into the 
  // current line. If the next line is empty, then the author has created paragraphs, and we want to 
  // not merge paragraphs, only sentences. If the next line looks like the last line and does not 
  // have content, then we want to keep that extra line, because of the javadoc comment style. 
  // We know that there is a next line because we previously checked that the current line is not 
  // the final line.

  if (next === '*' || next == '*/' || next === '') {
    return;
  }

  // Check if the next line contains markdown list syntax.

  if (next.startsWith('* * ') || next.startsWith('* - ') || /^\*\s\d+\.\s/.test(next)) {
    return;
  }

  // Check for markdown header syntax.

  if (/^\*\s#{1,6}/.test(next)) {
    return;
  }

  // Check for markdown table syntax.

  if (next.startsWith('* |') && next.endsWith('|')) {
    return;
  }

  // Check for markdown fence syntax

  if (next.startsWith('* ```')) {
    return;
  }

  // Check for TODO like comments
  if (next.startsWith('* TODO:')) {
    return;
  }

  if (next.startsWith('* WARN:')) {
    return;
  }

  if (next.startsWith('* HACK:')) {
    return;
  }

  if (next.startsWith('* TODO(')) {
    return;
  }

  // Search for the first intermediate whitespace in the next line. Since the '*' stuff is embedded 
  // in the text, we have to skip over that, and we have to skip over the initial space that
  // sometimes follows it.

  let edge = -1;
  if (next.startsWith('* ')) {
    edge = next.indexOf(' ', 3);
  } else if (next.startsWith('*')) {
    edge = next.indexOf(' ', 2);
  } else {
    edge = next.indexOf(' ');
  }

  // If there is no space in the next line, and merging the entire next line with the current line 
  // would cause the current line to overflow, then the current line is not underflowing.

  if (edge === -1 && next.length + text.length > maxLineLength) {
    return;
  }

  // If there is a space in the next line, and merging the text leading up to the space with the
  // current line would cause the current line to overflow, then the current line is not
  // underflowing.

  if (edge !== -1 && edge + text.length > maxLineLength) {
    return;
  }

  // Underflow can only occur if the next line does not look like a JSDoc line. We try to run this 
  // regex last since it is expensive.

  if (/^\s*\*\s+@[a-zA-Z]+/.test(next)) {
    return;
  }

  const report: eslint.Rule.ReportDescriptor = {
    node,
    loc: comment.loc,
    messageId: 'underflow',
    data: {
      line_length: `${text.length}`,
      max_length: `${maxLineLength}`
    },
    fix: function (fixer) {
      const adjustment = edge === -1 ? 2 : 3;
      return fixer.replaceTextRange([
        lineRangeStart + code.lines[line - 1].length,
        lineRangeStart + code.lines[line - 1].length + 1 + code.lines[line].indexOf('*') + 
          adjustment
      ], ' ');
    }
  };

  return report;
}
