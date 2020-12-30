import eslint from 'eslint';
import { CommentLine, endIndexOf, tokenize } from './util';

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

  if (previous.index < previous.comment.loc.end.line &&
    endIndexOf(previous, 'content') <= threshold) {
    return;
  }

  if (previous.index === previous.comment.loc.end.line &&
    endIndexOf(previous, 'close') <= threshold) {
    return;
  }

  // edge case for content under the limit but trailing whitespace over the limit

  if (previous.comment.type === 'Line' && endIndexOf(previous, 'content') <= threshold &&
    endIndexOf(previous, 'suffix') > threshold) {
    return;
  }

  if (previous.directive) {
    return;
  }

  if (previous.comment.type === 'Block' && previous.prefix.startsWith('*') &&
    previous.markup.startsWith('@see')) {
    return;
  }

  // Accumulate tokens until the total length of the remaining tokens is less than the threshold, or
  // until there are no remaining tokens and there is at least one token meaning a hard break.

  const tokens = tokenize(previous.content);
  let remaining = endIndexOf(previous, 'close');
  let tokenSplitIndex = -1;

  for (let i = tokens.length - 1; i > -1; i--) {
    const token = tokens[i];
    const remainingAfterRemoval = remaining - token.length;

    // The presence of this token in the previous line contributes to its exceeding the threshold.
    // We know that there is some amount remaining because we know the threshold has been exceeded.
    // If removing this token would leave only the prefix remaining for the line, we are dealing
    // with one very large token that we need break apart. In this case we do not change the token
    // split index and leave it at either -1 or its previous index and conclude the search.

    if (remainingAfterRemoval === endIndexOf(previous, 'prefix')) {
      break;
    }

    // The presence of this token in the previous line contributes to its exceeding the threshold.
    // However, removing this token will not reduce the length of the previous line to before the
    // threshold because the remaining amount event after removal is still after the threshold.
    // Therefore, we should record that this token should be moved and continue searching for more
    // tokens to move.

    if (remainingAfterRemoval > threshold) {
      tokenSplitIndex = i;
      remaining -= token.length;
      continue;
    }

    if (remaining - token.length <= threshold) {
      // This is the final token to move. Moving this token will reduce the length of the previous
      // line to before the threshold. We should count this token as being moved and stop searching.
      tokenSplitIndex = i;
      remaining -= token.length;
      break;
    }
  }

  let tokenText;

  if (tokenSplitIndex === -1 || remaining > threshold) {
    console.log('hard break');
    // if we were unable to split nicely, then we want to hard break
    tokenText = previous.text.slice(threshold);
  } else {
    const excessTokens = tokens.slice(tokenSplitIndex);
    tokenText = excessTokens.join('');
  }

  let replacementText = '\n';

  if (previous.comment.type === 'Line') {
    replacementText += previous.lead_whitespace;
    replacementText += previous.open;
    replacementText += previous.prefix;

    // TEMP: do not trim for a moment, examining tokens
    // replacementText += tokenText.trimStart();

    replacementText += tokenText;
  } else if (previous.index === previous.comment.loc.start.line &&
    previous.index === previous.comment.loc.end.line) {
    // This is a one line block comment. We have to be careful about the open/close regions.

    replacementText += previous.lead_whitespace;

    // If the character after the comment start is *, then this looks like a javadoc comment. The
    // new line introduced should have one extra leading space in the lead whitespace region.

    if (previous.comment.type === 'Block' && previous.prefix.startsWith('*')) {
      replacementText += ' ';
    }

    replacementText += previous.prefix;

    // In the content region, introduce extra leading whitespace equal to the length of the markup.
    // We do not copy over the markup, that would cause splitting of list items to create new list
    // items, we just want the next line to be indented under the current list item.
    // TODO: this is probably wrong, have to be more careful about what gets stored in markup.

    replacementText += ''.padEnd(previous.markup.length + previous.markup_space.length);

    replacementText += tokenText.trimStart();
  } else if (previous.index === previous.comment.loc.start.line) {
    // This comment starts on the first line of the block comment, but does not end on the first
    // line of the block comment.

    replacementText += previous.lead_whitespace;

    // If the character after the comment start is *, then this looks like a javadoc comment. The
    // new line introduced should have one extra leading space in the lead whitespace region.

    if (previous.comment.type === 'Block' && previous.prefix.startsWith('*')) {
      replacementText += ' ';
    }

    replacementText += previous.prefix;
    replacementText += ''.padEnd(previous.markup.length + previous.markup_space.length);
    replacementText += tokenText.trimStart();
  } else if (previous.index === previous.comment.loc.end.line) {
    // The final line of a block comment.

    replacementText += previous.lead_whitespace;

    if (previous.prefix.startsWith('*')) {
      replacementText += previous.prefix;
      replacementText += ''.padEnd(previous.markup.length + previous.markup_space.length);
    }
    replacementText += tokenText.trimStart();
  } else {
    // An intermediate line in a block comment.
    replacementText += previous.lead_whitespace;
    replacementText += previous.prefix;
    replacementText += ''.padEnd(previous.markup.length +  previous.markup_space.length);
    replacementText += tokenText.trimStart();
  }

  // Since we are moving text into the next line, which might have content, conditionally add in
  // an extra space to ensure the moved text is not immediately adjacent.

  if (current && current.content.charAt(0) !== ' ') {
    replacementText += ' ';
  }

  console.log('replacement text: "%s"', replacementText.replace(/\n/, '\\n'));

  // Compute the range start column. This is the position in the previous line where the break will
  // occur, where 0 is the first position of the previous line. This is not the position in the
  // entire file.

  let rangeStartColumn: number;
  if (tokenSplitIndex === -1) {
    // when not finding a split, we are doing a hard break at the threshold
    rangeStartColumn = threshold;
  } else {
    // if we found a split, then we are breaking at the point before the first token being moved
    // to the next line
    rangeStartColumn = previous.text.length - tokenText.length;
  }

  console.log('replacement range start column:', rangeStartColumn);

  // TODO: this is wrong, this should not be threshold, this should be the break position if found
  // and then fallback to the threshold

  const rangeStart = previous.context.code.getIndexFromLoc({
    line: previous.index,
    column: rangeStartColumn
  });

  const rangeEnd = previous.context.code.getIndexFromLoc({
    line: current ? current.index : previous.index,
    column: current ? endIndexOf(current, 'prefix') : previous.text.length
  });

  const report: eslint.Rule.ReportDescriptor = {
    node: previous.context.node,
    loc: {
      start: {
        line: previous.index,
        column: 0
      },
      end: {
        line: current ? current.index : previous.index,
        column: current ? current.text.length : previous.text.length
      }
    },
    messageId: 'split',
    data: {
      line_length: `${previous.text.length}`,
      max_length: `${previous.context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.replaceTextRange([rangeStart, rangeEnd], replacementText);
    }
  };

  return report;

  // const contentBreakPosition = findContentBreak(previous);

  // let lineBreakPosition = -1;
  // if (contentBreakPosition > 0) {
  //   lineBreakPosition = contentBreakPosition;
  // } else if (previous.comment.type === 'Block' && previous.index === previous.comment.loc.end.line &&
  //   previous.comment.loc.end.column - 1 === threshold) {
  //   // Avoid breaking right in the middle of the close
  //   lineBreakPosition = threshold - 1;
  // } else {
  //   lineBreakPosition = threshold;
  // }

  // const lineStartIndex = previous.context.code.getIndexFromLoc({ line: previous.index, column: 0 });
  // const insertAfterRange: eslint.AST.Range = [0, lineStartIndex + lineBreakPosition];

  // let textToInsert = '\n';

  // if (previous.index === previous.comment.loc.start.line && previous.index === previous.comment.loc.end.line) {
  //   textToInsert += previous.text.slice(0, previous.lead_whitespace.length);

  //   // avoid appending /* to the new line
  //   if (previous.comment.type === 'Line') {
  //     textToInsert += previous.open;
  //   }

  //   // For a one line block comment that looks like javadoc when wrapping the first line, introduce
  //   // a new space.

  //   if (previous.comment.type === 'Block' && previous.prefix.startsWith('*')) {
  //     textToInsert += ' ';
  //   }

  //   textToInsert += previous.prefix + ''.padEnd(previous.markup.length + previous.markup_space.length);
  // } else if (previous.index === previous.comment.loc.start.line) {
  //   textToInsert += previous.text.slice(0, previous.lead_whitespace.length);
  //   if (previous.prefix.startsWith('*')) {
  //     // NOTE: unsure about this space
  //     textToInsert += ' ' + previous.prefix + ''.padEnd(previous.markup.length + previous.markup_space.length);
  //   }
  // } else if (previous.index === previous.comment.loc.end.line) {
  //   textToInsert += previous.text.slice(0, previous.lead_whitespace.length);
  //   if (previous.prefix.startsWith('*')) {
  //     textToInsert += previous.prefix + ''.padEnd(previous.markup.length + previous.markup_space.length);
  //   }
  // } else {
  //   textToInsert += previous.text.slice(0, previous.lead_whitespace.length + previous.prefix.length);
  //   textToInsert += ''.padEnd(previous.markup.length +  previous.markup_space.length, ' ');
  // }

  // return <eslint.Rule.ReportDescriptor>{
  //   node: previous.context.node,
  //   loc: {
  //     start: {
  //       line: previous.index,
  //       column: 0
  //     },
  //     end: {
  //       line: previous.index,
  //       column: previous.text.length
  //     }
  //   },
  //   messageId: 'split',
  //   data: {
  //     line_length: `${previous.text.length}`,
  //     max_length: `${previous.context.max_line_length}`
  //   },
  //   fix: function (fixer) {
  //     return fixer.insertTextAfterRange(insertAfterRange, textToInsert);
  //   }
  // };
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
