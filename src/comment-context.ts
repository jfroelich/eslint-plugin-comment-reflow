import eslint from 'eslint';
import estree from 'estree';

export interface CommentContext {
  node: estree.Node;
  code: eslint.SourceCode;
  comment: estree.Comment;
  comment_index: number;
  line: number;
  max_line_length: number;
  fenced: boolean;
  line_range_start: number;
}