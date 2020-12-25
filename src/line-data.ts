import type eslint from 'eslint';
import type estree from 'estree';

export interface CommentLine {
  /**
   * The ESLint line index, which is 1-based.
   */
  index: number;

  /**
   * The full text of a line containing a comment. The text does not include line break characters
   * because of how ESLint parses the lines. The text may include characters that are not a part of
   * the comment because the value is derived from a value in ESLint's line array which is computed
   * separately from its comments array. The text includes the comment syntax like the forward
   * slashes.
   */
  text: string;

  /**
   * The value of `line_text` after left trim
   */
  text_trimmed_start: string;

  /**
   * The slash and asterisk(s) along with immediately subsequent whitespace of a comment line. This
   * may be an empty string for non-javadoc comments. This does not include the whitespace
   * preceding the slash and/or asterisk(s).
   */
  prefix: string;

  /**
   * The text of the comment line excluding leading whitespace and excluding any leading slashes and
   * leading asterisks (and possible whitespace following the asterisks). Markdown syntax is a part
   * of the content. The content is left trimmed but is not right trimmed.
   */
  content: string;
}

/**
 * @todo probably can reuse for single line, should parse either based on comment type
 */
export function parseLine(code: eslint.SourceCode, comment: estree.Comment, line: number) {
  const output = <CommentLine>{};
  output.index = line;
  output.text = code.lines[line - 1];
  output.text_trimmed_start = output.text.trimStart();

  output.prefix = '';
  if (comment.type === 'Block') {
    if (line === comment.loc.start.line) {
      const matches = /^\/\*\*?\s*/.exec(output.text_trimmed_start);
      if (matches && matches.length === 1) {
        output.prefix = matches[0];
      }
    } else {
      const matches = /^\*\s*/.exec(output.text_trimmed_start);
      if (matches && matches.length === 1) {
        output.prefix = matches[0];
      }
    }
  } else if (comment.type === 'Line') {
    // TODO: implement me
  }

  output.content = '';
  if (line === comment.loc.end.line && comment.type === 'Block') {
    output.content = output.text_trimmed_start.slice(output.prefix.length, -2);
  } else {
    output.content = output.text_trimmed_start.slice(output.prefix.length);
  }

  return output;
}
