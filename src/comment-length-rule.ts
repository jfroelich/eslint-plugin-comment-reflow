import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { checkBlockComment } from './block-comment';
import { CommentContext } from './comment-context';
import { checkLineComment } from './line-comment';

export const commentLengthRule: eslint.Rule.RuleModule = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      overflow: 'Comment line overflows',
      underflow: 'Comment line underflows'
    }
  },
  create: createCommentLengthRule
};

function createCommentLengthRule(context: eslint.Rule.RuleContext) {
  return {
    Program(node: estree.Node) {
      return analyzeProgram(context, node);
    }
  };
}

function analyzeProgram(context: eslint.Rule.RuleContext, node: estree.Node) {
  let maxLineLength = 80;
  if (context.options && context.options.length) {
    maxLineLength = <number>context.options[0];
  }

  assert(Number.isInteger(maxLineLength), 'Invalid option for maximum line length');

  const code = context.getSourceCode();
  const comments = code.getAllComments();

  for (let index = 0; index < comments.length; index++) {
    const commentContext: CommentContext = {
      node,
      code,
      comment: comments[index],
      max_line_length: maxLineLength,
      comment_index: index
    };

    let report = checkBlockComment(commentContext);
    if (report) {
      return context.report(report);
    }

    report = checkLineComment(commentContext);
    if (report) {
      return context.report(report);
    }
  }
}
