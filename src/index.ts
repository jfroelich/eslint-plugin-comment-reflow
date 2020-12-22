import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { createBlockCommentLineOverflowReport } from './block-overflow';
import { createBlockCommentLineUnderflowReport } from './block-underflow';
import { createLineCommentLineOverflowReport } from './line-overflow';
import { createLineCommentLineUnderflowReport } from './line-underflow';

const plugin = {
  rules: {
    comment: <eslint.Rule.RuleModule>{
      meta: {
        type: 'layout',
        fixable: 'whitespace',
        messages: {
          overflow: 'Comment overflows',
          underflow: 'Comment underflows'
        }
      },
      create: createCommentRule
    }
  }
};

export = plugin;

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

  // Iterate over the all the comments. We have to do it this way because apparently comments are
  // not in the AST so no selector is available. Despite iterating over all the comments, however,
  // we do not look for all the errors to correct at once. We only look for the first error and fix
  // that and stop. The individual fixes alias akin to DSP filters to give the illusion of reflow.

  const code = context.getSourceCode();
  const comments = code.getAllComments();
  let lineRangeStart = 0;

  for (let index = 0; index < comments.length; index++) {
    const comment = comments[index];
    lineRangeStart = comment.range[0];
    let fenced = false;

    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
      if (comment.type === 'Block') {
        const text = code.lines[line - 1];
        if (text.trimStart().startsWith('* ```')) {
          fenced = !fenced;
        }
      }

      let report = null;
      report = createBlockCommentLineOverflowReport(node, code, comment, line, maxLineLength, 
        fenced, lineRangeStart);
      if (report) {
        return context.report(report);
      }

      report = createLineCommentLineOverflowReport(node, code, comment, line, maxLineLength,
        lineRangeStart);
      if (report) {
        return context.report(report);
      }

      report = createBlockCommentLineUnderflowReport(node, code, comment, line, maxLineLength, 
        fenced, lineRangeStart);
      if (report) {
        return context.report(report);
      }

      report = createLineCommentLineUnderflowReport(node, code, comment, index, line, maxLineLength, 
        lineRangeStart);
      if (report) {
        return context.report(report);
      }

      // -1 because line is 1-based, +1 for line break character (assuming just LF)
      lineRangeStart += code.lines[line - 1].length + 1;
    }
  }
}
