import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { checkBlockComment } from './block-comment/block-comment';
import { CommentContext } from './comment-context';
import { CommentLine } from './comment-line';
import { checkLineComment } from './line-comment/line-comment';
import { parseLine } from './parse-line';

export const commentLengthRule: eslint.Rule.RuleModule = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      overflow: 'Comment line should wrap',
      underflow: 'Comment lines should be merged'
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
  let previousLine: CommentLine;

  for (const comment of comments) {
    const commentContext: CommentContext = {
      node,
      code,
      comment,
      max_line_length: maxLineLength
    };

    if (commentContext.comment.type === 'Block') {
      const blockReport = checkBlockComment(commentContext);
      if (blockReport) {
        return context.report(blockReport);
      }
    } else if (commentContext.comment.type === 'Line') {
      const currentLine = parseLine(commentContext.code, commentContext.comment,
        commentContext.comment.loc.start.line);

      const singleLineReport = checkLineComment(commentContext, previousLine, currentLine);
      if (singleLineReport) {
        return context.report(singleLineReport);
      }

      previousLine = currentLine;
    } else {
      // ignore shebang
    }
  }
}
