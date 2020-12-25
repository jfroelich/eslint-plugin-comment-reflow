import type eslint from 'eslint';
import type estree from 'estree';

/**
 * Represents the state of a comment while it is being processed by the comment rule.
 */
export interface CommentContext {
  /**
   * The root module object from ESLint.
   */
  node: estree.Node;

  /**
   * The source code object from ESLint.
   */
  code: eslint.SourceCode;

  /**
   * The comment node from the ESLint AST.
   */
  comment: estree.Comment;

  /**
   * The index of the comment in the comments array. 0 based.
   */
  comment_index: number;

  /**
   * The index of the line in the lines array. This is a 1 based offset because the value is derived
   * from eslint's line number tracking.
   */
  line?: number;

  /**
   * The full text of the current line being processed in a block comment. The text does not include
   * line break characters because of how ESLint parses the lines. The text may include characters
   * that are not a part of the comment because the lines array is computed separately from the
   * comments array. The text includes the comment syntax like the forward slashes. We assume that
   * the caller checked that the comment is the first token on the line where the comment starts, so
   * here we know that any text preceding the start of the comment on the line is only whitespace.
   */
  line_text?: string;

  /**
   * The value of `line_text` after left trim
   */
  line_text_trimmed_start?: string;

  /**
   * The slash and asterisk(s) along with immediately subsequent whitespace of a comment line. This
   * may be an empty string for non-javadoc comments. This does not include the whitespace
   * preceding the slash and/or asterisk(s).
   */
  line_prefix?: string;

  /**
   * The text of the comment line excluding leading whitespace and excluding any slashes and
   * asterisks (and possible whitespace following the asterisks). Markdown syntax is a part of the
   * content. The content is left trimmed but is not right trimmed.
   */
  line_content?: string;

  /**
   * The author setting for the desired maximum number of characters per line.
   */
  max_line_length: number;

  /**
   * Whether the processing state of the comment is currently within a multi-line markdown code
   * section.
   */
  in_markdown_fence?: boolean;

  in_jsdoc_example?: boolean;
}