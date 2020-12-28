/**
 * Describes the line of a comment
 */
export interface CommentLineDesc {
  /** The ESLint line index, which is 1-based. */
  index: number;

  /** Whitespace characters leading up to the open or prefix. */
  lead_whitespace: string;

  /**
   * The characters that start the comment. For block comments this is only set on the first line.
   * This does not include the whitespace preceding or following the syntax.
   */
  open: string;

  /**
   * The characters that end the comment. For block comments this is only set on the last line. For
   * single line comments this is an empty string. This does not include the whitespace preceding or
   * following the star slash.
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
   * @todo i've confused myself here, does prefix include the open? i don't think it should.
   *
   * The slash and asterisk(s) along with immediately subsequent whitespace of a comment line. This
   * may be an empty string for non-javadoc comments. This does not include the whitespace
   * preceding the slash and/or asterisk(s).
   */
  prefix: string;

  /**
   * The text of the comment line excluding leading and trailing whitespace. Overlaps with markup.
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

  /** Whitespace that follows the content and precedes the close. */
  suffix: string;
}
