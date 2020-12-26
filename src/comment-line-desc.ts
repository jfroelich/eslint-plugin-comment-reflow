import type eslint from 'eslint';
import type estree from 'estree';

export interface CommentLineDesc {
  /**
   * The ESLint line index, which is 1-based.
   */
  index: number;

  /**
   * Whitespace characters leading up to the open or prefix.
   */
  lead_whitespace: string;

  /**
   * The characters that start the comment. For block comments this is only set on the first line.
   * This does not include the whitespace preceding or following the syntax.
   */
  open: string;

  /**
   * The characters that end the comment. For block comments this is only set on the last line. For
   * single line comments this is an empty string. This does not include the whitespace preceding or
   * following the syntax.
   */
  close: string;

  /**
   * The full text of a line containing a comment. The text does not include line break characters
   * because of how ESLint parses the lines. The text may include characters that are not a part of
   * the comment because the value is derived from a value in ESLint's line array which is computed
   * separately from its comments array. The text includes the comment syntax like the forward
   * slashes.
   */
  text: string;

  /**
   * The slash and asterisk(s) along with immediately subsequent whitespace of a comment line. This
   * may be an empty string for non-javadoc comments. This does not include the whitespace
   * preceding the slash and/or asterisk(s).
   */
  prefix: string;

  /**
   * The text of the comment line excluding leading whitespace and excluding any leading slashes and
   * leading asterisks (and possible whitespace following the asterisks). Markdown syntax is a part
   * of the content. The content is left trimmed but is not right trimmed. This does not include
   * the suffix.
   *
   * @todo right trim, move all whitespace to suffix, get rid of content_trimmed
   */
  content: string;

  /**
   * On any line other than the last line of the comment, this is an empty string. On the last line
   * of the comment, this is all of the whitespace following the content and the final star slash.
   * This does not include any characters after the final star slash.
   */
  suffix: string;
}

/**
 * @todo since our primary logic branches on one of five situations, we should organize the code
 * around those five situations, not based on which part of the line we are parsing.
 */
export function parseLine(code: eslint.SourceCode, comment: estree.Comment, line: number) {
  const output = <CommentLineDesc>{};
  output.index = line;
  output.text = code.lines[line - 1];

  // Parse the leading whitespace. For a single line comment, or the first line of a block comment,
  // this is all whitespace leading up to the first slash. For other lines of a block comment, this
  // is all whitespace leading up to the first non-whitespace character.

  const textTrimmedStart = output.text.trimStart();
  output.lead_whitespace = output.text.slice(0, output.text.length - textTrimmedStart.length);

  // Set the opening and closing text

  if (comment.type === 'Block') {
    if (line === comment.loc.start.line && line === comment.loc.end.line) {
      output.open = '/*';
      output.close = '*/';
    } else if (line === comment.loc.start.line) {
      output.open = '/*';
      output.close = '';
    } else if (line === comment.loc.end.line) {
      output.open = '';
      output.close = '*/';
    } else {
      output.open = '';
      output.close = '';
    }
  } else if (comment.type === 'Line') {
    output.open = '//';
    output.close = '';
  }

  // Parse the prefix. For line comments this includes the two forward slashes and any whitespace
  // preceding the content. For the first line of a block comment this includes the forward slash,
  // asterisk(s), and any whitespace preceding the content. For other lines, this includes the
  // leading asterisk if one is present and any whitespace preceding the content.

  if (comment.type === 'Block') {
    if (line === comment.loc.start.line && line === comment.loc.end.line) {
      const haystack = output.text.slice(output.lead_whitespace.length + output.open.length,
        comment.loc.end.column - output.close.length);
      const matches = /^\**\s*/.exec(haystack);
      output.prefix = matches ? matches[0] : '';
    } else if (line === comment.loc.start.line) {
      const haystack = output.text.slice(output.lead_whitespace.length + output.open.length);
      const matches = /^\*+\s*/.exec(haystack);
      output.prefix = matches ? matches[0] : '';
    } else if (line === comment.loc.end.line) {
      const haystack = output.text.slice(output.lead_whitespace.length,
        comment.loc.end.column - output.close.length);
      const matches = /^\*\s+/.exec(haystack);
      output.prefix = matches ? matches[0] : '';
    } else {
      const matches = /^\*\s+/.exec(textTrimmedStart);
      output.prefix = matches ? matches[0] : '';
    }
  } else if (comment.type === 'Line') {
    const text = output.text.slice(comment.loc.start.column + output.open.length);
    const whitespaceLength = text.length - text.trimStart().length;
    output.prefix = output.text.slice(comment.loc.start.column,
      comment.loc.start.column + output.open.length + whitespaceLength);
  }

  // Parse the content. This is all content following the prefix and preceding the suffix. The
  // content does not include leading or trailing whitespace.

  if (comment.type === 'Block') {
    if (line === comment.loc.start.line && line === comment.loc.end.line) {
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length, comment.loc.end.column - output.close.length).trimEnd();
    } else if (line === comment.loc.start.line) {
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length).trimEnd();
    } else if (line === comment.loc.end.line) {
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length, comment.loc.end.column - output.close.length).trimEnd();
    } else {
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length).trimEnd();
    }
  } else if (comment.type === 'Line') {
    output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
      output.prefix.length).trimEnd();
  }

  // Parse the suffix. For a single line comment this is all trailing whitespace after the last
  // non-whitespace character. For the last line of a block comment this is all whitespace following
  // the content and the comment end syntax. For other lines of a block comment this is all
  // whitespace following the content. The suffix does not include a line break.

  if (comment.type === 'Block') {
    if (line === comment.loc.start.line && line === comment.loc.end.line) {
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length, comment.loc.end.column - output.close.length);
    } else if (line === comment.loc.start.line) {
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length);
    } else if (line === comment.loc.end.line) {
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length, comment.loc.end.column - output.close.length);
    } else {
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length);
    }
  } else {
    output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length);
  }

  console.debug(output);

  return output;
}
