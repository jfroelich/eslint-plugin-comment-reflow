import type eslint from 'eslint';
import { CommentContext } from '../comment-context';
import { CommentLine } from '../comment-line';
import { findContentBreak } from '../find-content-break';

export function checkBlockOverflow(context: CommentContext, line: CommentLine) {
  if (!updatePreformattedState(context, line)) {
    return;
  }

  // If the total line length is less than the threshold then it does not overflow.

  if (line.text.length <= context.max_line_length) {
    return;
  }

  // If leading whitespace is over the threshold then the line overflows but we ignore.

  if (line.lead_whitespace.length >= context.max_line_length) {
    return;
  }

  // If the line length including just the prefix is over the threshold then the line overflows but
  // we ignore.

  if (line.lead_whitespace.length + line.open.length + line.prefix.length >=
    context.max_line_length) {
    return;
  }

  // If the total line length less trailing whitespace is under the threshold then we ignore. We
  // know that the total line length is greater than the threshold otherwise we would have already
  // exited. This means some line has a bunch of extra spaces at the end of it. The line visually
  // fits under the threshold but the spaces are what cause the length to cross the threshold. This
  // isn't something we want to fix. This happens to authors who do not use the no-trailing-spaces
  // rule. We have to specially handle when we are at the final line because the suffix trailing
  // whitespace is a part of the comment.

  if (line.index < context.comment.loc.end.line && line.lead_whitespace.length + line.open.length +
    line.prefix.length + line.content.length <= context.max_line_length) {
    return;
  } else if (line.index === context.comment.loc.end.line && line.lead_whitespace.length +
    line.open.length + line.prefix.length + line.content.length + line.suffix.length +
    line.close.length <= context.max_line_length) {
    return;
  }

  // Ignore tslint directives.

  if (line.index === context.comment.loc.start.line && !line.prefix.startsWith('*') &&
    line.content.startsWith('tslint:')) {
    return;
  }

  // Ignore see tags.
  // TODO: once we properly check for jsdoc tag then we should be testing against that substring
  // instead of content?

  if (line.prefix.startsWith('*') && line.content.startsWith('@see')) {
    return;
  }

  const contentBreakPosition = findContentBreak(line, context.max_line_length);

  // Determine the breaking point in the line itself, taking into account whether we found a space.
  // If no breaking point was found then fallback to breaking at the threshold. Note we rule out
  // a space found at 0, that should never happen because that space should belong to the prefix.

  let lineBreakPosition = -1;
  if (contentBreakPosition > 0) {
    lineBreakPosition = contentBreakPosition;
  } else if (line.index === context.comment.loc.end.line &&
    context.comment.loc.end.column - 1 === context.max_line_length) {
    // Avoid breaking right in the middle of the close
    lineBreakPosition = context.max_line_length - 1;
  } else {
    lineBreakPosition = context.max_line_length;
  }

  // Determine the index of the current line. The term "index" here aligns with what ESLint refers
  // to as the offset of the first character of the line relative to the first character in the
  // entire file, which has index 0.

  // An alternative approach to calculating this value would be to sum up the lengths of the
  // previous lines. But it turns out that approach has not so obvious complexity. We do not have
  // easy access to the line breaks in use. The API call here is better because it properly accounts
  // for line breaks in the same way as the rest of ESLint.

  const lineStartIndex = context.code.getIndexFromLoc({ line: line.index, column: 0 });

  // Compute the range of the text after which we will insert some new text. This range is relative
  // to the entire file.

  const insertAfterRange: eslint.AST.Range = [0, lineStartIndex + lineBreakPosition];

  // Build the text to insert. We want to carry over the same preceding whitespace content and the
  // same prefix.

  // TODO: we need to conditionally trim. But we cannot trim if we are just inserting. Therefore,
  // I think we cannot use insert. We have to use replace. Or we have to consider both, based on
  // whether there is whitespace or not. To test, use a breaking sequence of a couple spaces and
  // notice how the next line is has strange post-prefix indent, because the extra spaces are
  // carried over, but we want to get rid of them.
  // TODO: we need to figure out whether to insert CRLF or just LF

  let textToInsert = '\n';

  if (line.index === context.comment.loc.start.line &&
    line.index === context.comment.loc.end.line) {
    textToInsert += line.text.slice(0, line.lead_whitespace.length);
    if (line.prefix.startsWith('*')) {
      textToInsert += ' ' + line.prefix + ''.padEnd(line.markup.length + line.markup_space.length);
    }
  } else if (line.index === context.comment.loc.start.line) {
    textToInsert += line.text.slice(0, line.lead_whitespace.length);
    if (line.prefix.startsWith('*')) {
      textToInsert += ' ' + line.prefix + ''.padEnd(line.markup.length + line.markup_space.length);
    }
  } else if (line.index === context.comment.loc.end.line) {
    textToInsert += line.text.slice(0, line.lead_whitespace.length);
    if (line.prefix.startsWith('*')) {
      textToInsert += line.prefix + ''.padEnd(line.markup.length + line.markup_space.length);
    }
  } else {
    textToInsert += line.text.slice(0, line.lead_whitespace.length + line.prefix.length);
    textToInsert += ''.padEnd(line.markup.length +  line.markup_space.length, ' ');
  }

  return <eslint.Rule.ReportDescriptor>{
    node: context.node,
    loc: {
      start: {
        line: line.index,
        column: 0
      },
      end: {
        line: line.index,
        column: line.text.length
      }
    },
    messageId: 'overflow',
    data: {
      line_length: `${line.text.length}`,
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.insertTextAfterRange(insertAfterRange, textToInsert);
    }
  };
}

/**
 * Detects transitions into and out of a preformatted state in a block comment. Returns whether the
 * text should still be considered for overflow.
 */
function updatePreformattedState(context: CommentContext, line: CommentLine) {
  if (context.in_md_fence) {
    if (line.index > context.comment.loc.start.line && line.content.startsWith('```')) {
      // Exiting markdown fence section. Do not consider overflow.
      context.in_md_fence = false;
      return false;
    } else {
      // Remaining in markdown fence section. Do not consider overflow.
      return false;
    }
  } else if (context.in_jsdoc_example) {
    if (line.content.startsWith('@')) {
      if (line.content.startsWith('@example')) {
        // Remaining in jsdoc example section. Do not consider overflow.
        return false;
      } else {
        // Exiting jsdoc example section. Consider overflow. Fall through.
        context.in_jsdoc_example = false;
      }
    } else {
      // Remaining in jsdoc example section. Do not consider overflow.
      return false;
    }
  } else if (line.index > context.comment.loc.start.line && line.content.startsWith('```')) {
    // Entering markdown fence section. Do not consider overflow.
    context.in_md_fence = true;
    return false;
  } else if (line.index > context.comment.loc.start.line && line.content.startsWith('@example')) {
    // Entering jsdoc example section. Do not consider overflow.
    context.in_jsdoc_example = true;
    return false;
  }

  // Consider overflow.
  return true;
}
