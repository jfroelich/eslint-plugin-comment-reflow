import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { merge } from './merge';
import { split } from './split';
import { CommentContext, CommentLine, parseLine, sniffLineBreakStyle } from './util';

export default <eslint.Rule.RuleModule>{
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      split: 'Line {{line}} should break at column {{column}}.',
      merge: 'Line {{line}} should be merged with previous line.'
    }
  },
  create: createCommentLengthRule
};

function createCommentLengthRule(context: eslint.Rule.RuleContext) {
  return {
    Program: function(node: estree.Node) {
      return analyzeProgram(context, node);
    }
  };
}

function analyzeProgram(ruleContext: eslint.Rule.RuleContext, node: estree.Node) {
  let maxLineLength = 80;
  if (ruleContext.options && ruleContext.options.length) {
    maxLineLength = <number>ruleContext.options[0];
  }

  assert(Number.isInteger(maxLineLength), 'Invalid option for maximum line length');

  const code = ruleContext.getSourceCode();
  const comments = code.getAllComments();
  let previousLine: CommentLine;
  let finalLineCommentLine: CommentLine;

  const lineBreakStyle = sniffLineBreakStyle(ruleContext);

  // TODO: create a CommentLineGroup type to represent either the lines of one block comment or
  // the individual lines of several line comments. Next, refactor the comment iteration. We want
  // to iterate over the comments one at a time. Each time we encounter a comment, if it is a block
  // comment, then we first check if there are buffered line comments, process those, and then
  // process the block comment. Otherwise, if it is a line comment, we check if the buffer is empty.
  // if the buffer is empty, we append the line to the buffer and continue. If it is not empty, we
  // check if the new line is subsequent to the last line of the buffer. If it is subsequent, then
  // we append it to the buffer and continue. If it is not subsequent, then we process the lines in
  // the buffer as group, clear the buffer, append the new line to the buffer, and continue. Once
  // we reach the end of the comments, we do one extra check for whether the buffer is empty and
  // then process it.

  // To process a line buffer, we will call a helper function that processes a CommentLineGroup
  // object. That one object will check for splits and merges. It will generate replacement text for
  // the comment line group. If there is no work to be done, then there is no fix. Otherwise, the
  // helper function returns a single fix that replaces the CommentLineGroup. That single fix may
  // perform several merges/splits at once. It may replace multiple lines of text at once. It may
  // affect multiple line comments at once.

  // As we complete the processing of each line group, we call context.report to notify eslint of
  // the fix and continue. We do not wait until all processing has completed.

  for (const comment of comments) {
    const context: CommentContext = {
      node,
      code,
      line_break: lineBreakStyle,
      max_line_length: maxLineLength,
      in_md_fence: false,
      in_jsdoc_example: false
    };

    const previousToken = code.getTokenBefore(comment, { includeComments: true });
    if (previousToken && previousToken.loc.end.line === comment.loc.start.line) {
      continue;
    }

    const nextToken = code.getTokenAfter(comment, { includeComments: true });
    if (nextToken && comment.loc.end.line === nextToken.loc.start.line) {
      continue;
    }

    if (comment.type === 'Block') {
      previousLine = null;

      let reportedSplitLine = -1;

      for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
        const currentLine = parseLine(context, comment, line);

        if (previousLine) {
          const report = split(previousLine, currentLine);
          if (report) {
            ruleContext.report(report);

            // TODO: I do not yet understand why, but if we continue to report additional errors on
            // this comment things do not work so well, so, for now, exit. eslint re-evaluates
            // anyway. The only bad part is we do not see all the errors at once, just the first
            // error per block comment.

            // Regarding the error, my best guess is that it is because we generate multiple fixes
            // and some of the fixes overlap. The docs explicitly say not to do this.

            // See https://eslint.org/docs/developer-guide/working-with-rules

            // NOTE: we also do not want to continue here, that generates the same error 10 times

            reportedSplitLine = previousLine.index;
            break;
          }
        }

        const report = merge(previousLine, currentLine);
        if (report) {
          ruleContext.report(report);
        }

        previousLine = currentLine;
      }

      // We have to check we did not already report the same line, even though ordinarily this
      // should not be required. This logic was written originally because we naively reported all
      // split errors per block. It turns out that approach has some strange issues. For now this is
      // a quick bandaid.

      if (previousLine && reportedSplitLine !== previousLine.index) {
        const report = split(previousLine);
        if (report) {
          ruleContext.report(report);
        }
      }

      previousLine = null;
    } else if (comment.type === 'Line') {
      const currentLine = parseLine(context, comment, comment.loc.start.line);

      if (previousLine) {
        const report = split(previousLine,
          previousLine.index + 1 === currentLine.index ? currentLine : null);
        if (report) {
          ruleContext.report(report);

          // similar issue to block split, i dont want to do this but right now without this the
          // multiple fixes are wrong.
          continue;
        }
      }

      const report = merge(previousLine, currentLine);
      if (report) {
        ruleContext.report(report);
      }

      previousLine = currentLine;
      finalLineCommentLine = currentLine;
    }
  }

  if (finalLineCommentLine) {
    const report = split(finalLineCommentLine);
    if (report) {
      ruleContext.report(report);
    }
  }
}
