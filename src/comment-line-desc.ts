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
   * Overlaps with content. The content is parsed for semantic information such as markdown or
   * jsdoc.
   */
  markup: string;

  /**
   * Overlaps with content. Represents the whitespace immediately following the markup token up to
   * the first non-space character (exclusive), if any markup was found.
   */
  markup_space: string;

  /**
   * On any line other than the last line of the comment, this is an empty string. On the last line
   * of the comment, this is all of the whitespace following the content and the final star slash.
   * This does not include any characters after the final star slash.
   */
  suffix: string;
}
