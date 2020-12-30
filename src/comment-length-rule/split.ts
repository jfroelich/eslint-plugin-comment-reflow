import eslint from 'eslint';
import estree from 'estree';
import { CommentContext, CommentLine, endIndexOf } from './util';

export function split(context: CommentContext, comment: estree.Comment, line: CommentLine) {
  if (!updatePreformattedState(context, comment, line)) {
    return;
  }

  const threshold = context.max_line_length;

  if (line.text.length <= threshold) {
    return;
  }

  if (line.lead_whitespace.length >= threshold) {
    return;
  }

  if (endIndexOf(line, 'open') >= threshold) {
    return;
  }

  if (endIndexOf(line, 'prefix') >= threshold) {
    return;
  }

  if (line.index < comment.loc.end.line && endIndexOf(line, 'content') <= threshold) {
    return;
  }

  if (line.index === comment.loc.end.line && endIndexOf(line, 'close') <= threshold) {
    return;
  }

  if (line.directive.length > 0) {
    return;
  }

  if (comment.type === 'Block' && line.prefix.startsWith('*') && line.markup.startsWith('@see')) {
    return;
  }

  const contentBreakPosition = findContentBreak(line, threshold);

  let lineBreakPosition = -1;
  if (contentBreakPosition > 0) {
    lineBreakPosition = contentBreakPosition;
  } else if (comment.type === 'Block' && line.index === comment.loc.end.line &&
    comment.loc.end.column - 1 === threshold) {
    // Avoid breaking right in the middle of the close
    lineBreakPosition = threshold - 1;
  } else {
    lineBreakPosition = threshold;
  }

  const lineStartIndex = context.code.getIndexFromLoc({ line: line.index, column: 0 });
  const insertAfterRange: eslint.AST.Range = [0, lineStartIndex + lineBreakPosition];

  let textToInsert = '\n';

  if (line.index === comment.loc.start.line && line.index === comment.loc.end.line) {
    textToInsert += line.text.slice(0, line.lead_whitespace.length);

    // avoid appending /* to the new line
    if (comment.type === 'Line') {
      textToInsert += line.open;
    }

    // For a one line block comment that looks like javadoc when wrapping the first line, introduce
    // a new space.

    if (comment.type === 'Block' && line.prefix.startsWith('*')) {
      textToInsert += ' ';
    }

    textToInsert += line.prefix + ''.padEnd(line.markup.length + line.markup_space.length);
  } else if (line.index === comment.loc.start.line) {
    textToInsert += line.text.slice(0, line.lead_whitespace.length);
    if (line.prefix.startsWith('*')) {
      // NOTE: unsure about this space
      textToInsert += ' ' + line.prefix + ''.padEnd(line.markup.length + line.markup_space.length);
    }
  } else if (line.index === comment.loc.end.line) {
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
    messageId: 'split',
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
function updatePreformattedState(context: CommentContext, comment: estree.Comment,
  line: CommentLine) {
  if (comment.type !== 'Block') {
    return true;
  }

  if (context.in_md_fence) {
    if (line.index > comment.loc.start.line && line.content.startsWith('```')) {
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
  } else if (line.index > comment.loc.start.line && line.content.startsWith('```')) {
    // Entering markdown fence section. Do not consider overflow.
    context.in_md_fence = true;
    return false;
  } else if (line.index > comment.loc.start.line && line.content.startsWith('@example')) {
    // Entering jsdoc example section. Do not consider overflow.
    context.in_jsdoc_example = true;
    return false;
  }

  // Consider overflow.
  return true;
}

/**
 * Return the position where to break the text or -1. This only searches in a subregion of the text
 * so as to not match whitespace in other places.
 */
export function findContentBreak(line: CommentLine, threshold: number) {
  if (endIndexOf(line, 'suffix') <= threshold) {
    return -1;
  }

  // Ugly fix for when there is a space just after the threshold but not just before it. In this
  // case we want to use this space as the break point and not some preceding space.

  if (line.text.charAt(threshold - 1).trim() && !line.text.charAt(threshold).trim()) {
    return threshold;
  }

  // Determine the search space for searching for space.

  const regionStart = endIndexOf(line, 'prefix') + line.markup.length +
    line.markup_space.length;
  const regionEnd = Math.min(threshold, endIndexOf(line, 'content'));
  const region = line.text.slice(regionStart, regionEnd);

  // Find the last space in the last sequence of spaces.

  const endPos = region.lastIndexOf(' ');

  // Find the first space in the sequence of spaces.

  let startPos = endPos;
  if (startPos > -1) {
    while (region.charAt(startPos - 1) === ' ') {
      startPos--;
    }
  }

  // Return the position in the search space translated to the position in the line.

  return startPos === -1 ? startPos : line.lead_whitespace.length + line.open.length +
    line.prefix.length + line.markup.length + line.markup_space.length + startPos;
}
