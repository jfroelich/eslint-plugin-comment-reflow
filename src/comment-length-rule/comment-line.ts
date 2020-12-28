/**
 * Describes a line of a comment
 */
export interface CommentLine {
  /**
   * The ESLint line index, which is 1-based. This should not be confused with some kind of index
   * into an array of lines for a comment. This is the global index for the entire file.
   */
  index: number;

  /**
   * Whitespace characters leading up to the open region. For a block comment, it is assumed that
   * block comments that follow another kind of token on the same line are never analyzed, so this
   * means that this is whitespace starting from the first character in the line.
   */
  lead_whitespace: string;

  /**
   * The syntactical characters that start the comment. For block comments this is only set on the
   * first line and for all other lines is an empty string. This does not include the whitespace
   * preceding or following the characters. For javadoc-formatted block comments this does not
   * include the second asterisk. For triple slash line comments, this does not include the third
   * slash.
   */
  open: string;

  /**
   * The characters that end the comment. For block comments this is set on the last line. In all
   * other situations this is an empty string. This does not include the whitespace preceding or
   * following the star slash.
   */
  close: string;

  /**
   * The full text of a line containing a comment. The text does not include line break characters
   * because of how ESLint parses the lines. The text may include characters that are not a part of
   * the comment because the value is derived from a value in ESLint's line array which is computed
   * separately from its comments array. The text includes the comment syntax like the forward
   * slashes. Because it is assumed that block comments that follow another kind of token on the
   * same line are not analyzed, the text starts from the first character on the line.
   */
  text: string;

  /**
   * The characters between the comment open and the start of the content. For example, for a single
   * line comment, this is the whitespace following the slashes and before the text. For a javadoc
   * formatted comment line in the middle of the comment, this might include a leading asterisk
   * followed by some whitespace. For the first line of a javadoc comment, this will include the
   * second asterisk as its first character.
   */
  prefix: string;

  /**
   * The text of the comment line between its prefix and suffix.
   */
  content: string;

  /**
   * Represents the occassional initial markup that appears at the start of the line's content such
   * as a jsdoc tag or some markdown. Markup does not precede the content like the prefix; it
   * overlaps.
   */
  markup: string;

  /**
   * Represents the whitespace immediately following the markup token up to the first non-space
   * character (exclusive). Overlaps with content.
   */
  markup_space: string;

  /** Whitespace that follows the content and precedes the close. */
  suffix: string;
}

type Region = keyof Pick<CommentLine,
  'lead_whitespace' | 'open' | 'close' | 'prefix' | 'content' | 'suffix' | 'close'>;

/**
 * Returns the length of the text in the given line up to the start or end of the given region. If
 * inclusive is true then this is up to the end of the region.
 */
export function getRegionLength(line: CommentLine, region: Region, inclusive = true) {
  switch (region) {
    case 'lead_whitespace': {
      return inclusive ? line.lead_whitespace.length : 0;
    }

    case 'open': {
      return line.lead_whitespace.length + (inclusive ? line.open.length : 0);
    }

    case 'prefix': {
      return line.lead_whitespace.length + line.open.length + (inclusive ? line.prefix.length : 0);
    }

    case 'content': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        (inclusive ? line.content.length : 0);
    }

    case 'suffix': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + (inclusive ? line.suffix.length : 0);
    }

    case 'close': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + line.suffix.length + (inclusive ? line.close.length : 0);
    }

    default: {
      throw new Error(`Unknown/unsupported region "${<string>region}"`);
    }
  }
}
