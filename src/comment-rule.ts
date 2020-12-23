import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { createBlockCommentLineOverflowReport } from './block-overflow';
import { createBlockCommentLineUnderflowReport } from './block-underflow';
import { CommentContext } from './comment-context';
import { createLineCommentLineOverflowReport } from './line-overflow';
import { createLineCommentLineUnderflowReport } from './line-underflow';

export const commentRule: eslint.Rule.RuleModule = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      overflow: 'Comment overflows',
      underflow: 'Comment underflows'
    }
  },
  create: createCommentRule
};

function createCommentRule(context: eslint.Rule.RuleContext) {
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
    const comment = comments[index];

    const commentContext: CommentContext = {
      node,
      code,
      comment,
      fenced: false,
      max_line_length: maxLineLength,
      comment_index: index
    };

    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
      commentContext.line = line;

      let report = null;
      report = createBlockCommentLineOverflowReport(commentContext);
      if (report) {
        return context.report(report);
      }

      report = createLineCommentLineOverflowReport(commentContext);
      if (report) {
        return context.report(report);
      }

      report = createBlockCommentLineUnderflowReport(commentContext);
      if (report) {
        return context.report(report);
      }

      report = createLineCommentLineUnderflowReport(commentContext);
      if (report) {
        return context.report(report);
      }
    }
  }
}
