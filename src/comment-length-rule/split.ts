import eslint from 'eslint';
import { CommentLine, endIndexOf } from './util';

export function split(previous: CommentLine, current?: CommentLine) {
  if (current && (previous.index + 1 !== current.index)) {
    return;
  }

  if (!updatePreformattedState(previous)) {
    return;
  }

  const threshold = previous.context.max_line_length;

  if (previous.text.length <= threshold) {
    return;
  }

  if (previous.lead_whitespace.length >= threshold) {
    return;
  }

  if (endIndexOf(previous, 'open') >= threshold) {
    return;
  }

  if (endIndexOf(previous, 'prefix') >= threshold) {
    return;
  }

  if (previous.index < previous.comment.loc.end.line && endIndexOf(previous, 'content') <= threshold) {
    return;
  }

  if (previous.index === previous.comment.loc.end.line && endIndexOf(previous, 'close') <= threshold) {
    return;
  }

  if (previous.directive) {
    return;
  }

  if (previous.comment.type === 'Block' && previous.prefix.startsWith('*') &&
    previous.markup.startsWith('@see')) {
    return;
  }

  const contentBreakPosition = findContentBreak(previous);

  let lineBreakPosition = -1;
  if (contentBreakPosition > 0) {
    lineBreakPosition = contentBreakPosition;
  } else if (previous.comment.type === 'Block' && previous.index === previous.comment.loc.end.line &&
    previous.comment.loc.end.column - 1 === threshold) {
    // Avoid breaking right in the middle of the close
    lineBreakPosition = threshold - 1;
  } else {
    lineBreakPosition = threshold;
  }

  const lineStartIndex = previous.context.code.getIndexFromLoc({ line: previous.index, column: 0 });
  const insertAfterRange: eslint.AST.Range = [0, lineStartIndex + lineBreakPosition];

  let textToInsert = '\n';

  if (previous.index === previous.comment.loc.start.line && previous.index === previous.comment.loc.end.line) {
    textToInsert += previous.text.slice(0, previous.lead_whitespace.length);

    // avoid appending /* to the new line
    if (previous.comment.type === 'Line') {
      textToInsert += previous.open;
    }

    // For a one line block comment that looks like javadoc when wrapping the first line, introduce
    // a new space.

    if (previous.comment.type === 'Block' && previous.prefix.startsWith('*')) {
      textToInsert += ' ';
    }

    textToInsert += previous.prefix + ''.padEnd(previous.markup.length + previous.markup_space.length);
  } else if (previous.index === previous.comment.loc.start.line) {
    textToInsert += previous.text.slice(0, previous.lead_whitespace.length);
    if (previous.prefix.startsWith('*')) {
      // NOTE: unsure about this space
      textToInsert += ' ' + previous.prefix + ''.padEnd(previous.markup.length + previous.markup_space.length);
    }
  } else if (previous.index === previous.comment.loc.end.line) {
    textToInsert += previous.text.slice(0, previous.lead_whitespace.length);
    if (previous.prefix.startsWith('*')) {
      textToInsert += previous.prefix + ''.padEnd(previous.markup.length + previous.markup_space.length);
    }
  } else {
    textToInsert += previous.text.slice(0, previous.lead_whitespace.length + previous.prefix.length);
    textToInsert += ''.padEnd(previous.markup.length +  previous.markup_space.length, ' ');
  }

  return <eslint.Rule.ReportDescriptor>{
    node: previous.context.node,
    loc: {
      start: {
        line: previous.index,
        column: 0
      },
      end: {
        line: previous.index,
        column: previous.text.length
      }
    },
    messageId: 'split',
    data: {
      line_length: `${previous.text.length}`,
      max_length: `${previous.context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.insertTextAfterRange(insertAfterRange, textToInsert);
    }
  };
}

/**
 * Detects transitions into and out of a preformatted state in a block comment. This mutates the
 * context associated with the given line. Returns whether the text should still be considered for
 * overflow.
 */
function updatePreformattedState(line: CommentLine) {
  if (line.comment.type !== 'Block') {
    return true;
  }

  if (line.context.in_md_fence) {
    if (line.index > line.comment.loc.start.line && line.content.startsWith('```')) {
      // Exiting markdown fence section. Do not consider overflow.
      line.context.in_md_fence = false;
      return false;
    } else {
      // Remaining in markdown fence section. Do not consider overflow.
      return false;
    }
  } else if (line.context.in_jsdoc_example) {
    if (line.content.startsWith('@')) {
      if (line.content.startsWith('@example')) {
        // Remaining in jsdoc example section. Do not consider overflow.
        return false;
      } else {
        // Exiting jsdoc example section. Consider overflow. Fall through.
        line.context.in_jsdoc_example = false;
      }
    } else {
      // Remaining in jsdoc example section. Do not consider overflow.
      return false;
    }
  } else if (line.index > line.comment.loc.start.line && line.content.startsWith('```')) {
    // Entering markdown fence section. Do not consider overflow.
    line.context.in_md_fence = true;
    return false;
  } else if (line.index > line.comment.loc.start.line && line.content.startsWith('@example')) {
    // Entering jsdoc example section. Do not consider overflow.
    line.context.in_jsdoc_example = true;
    return false;
  }

  // Consider overflow.
  return true;
}

/**
 * Return the position where to break the text or -1. This only searches in a subregion of the text
 * so as to not match whitespace in other places.
 */
export function findContentBreak(line: CommentLine) {
  const threshold = line.context.max_line_length;

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
