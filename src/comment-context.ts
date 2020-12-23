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
   * The author setting for the desired maximum number of characters per line.
   */
  max_line_length: number;

  /**
   * Whether the processing state of the comment is currently within a multi-line markdown code
   * section.
   */
  fenced?: boolean;
}