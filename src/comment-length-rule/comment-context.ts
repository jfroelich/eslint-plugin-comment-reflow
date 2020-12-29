import type eslint from 'eslint';
import type estree from 'estree';

export interface CommentContext {
  node: estree.Node;
  code: eslint.SourceCode;
  max_line_length: number;
  in_md_fence?: boolean;
  in_jsdoc_example?: boolean;
}
