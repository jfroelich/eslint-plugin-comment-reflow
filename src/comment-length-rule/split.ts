import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
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

  // Handle a peculiar edge case because of support for authors who do not use no-trailing-spaces.
  // We have to be considerate of trailing whitespace. It is possible that the content is visibly
  // under the limit, but the trailing whitespace pushes the end position of the comment over the
  // limit. This only applies when the whitespace is not visibly part of the content, meaning that
  // this applies to all situations other than the final line of a block comment because that is the
  // only situation where there is close syntax.

  if ((previous.comment.type === 'Line' || previous.index !== previous.comment.loc.end.line) &&
    endIndexOf(previous, 'content') <= threshold && endIndexOf(previous, 'suffix') > threshold) {
    return;
  }

  if (previous.directive) {
    return;
  }

  if (previous.comment.type === 'Block' && previous.prefix.startsWith('*') &&
    previous.markup.startsWith('@see')) {
    return;
  }

  // The thought process is as follows. I want to eventually use one common set of logic for each
  // of the scenarios. However, the various scenarios are complicated and the different concerns
  // all mixed together so I am going to solve the scenarios one at a time, get a minimally working
  // example, and then examine how the scenarios have commonality. So this is not the way I wanted
  // to do it but it is a way that going forward will work until I have a clearer picture. What this
  // is, is an interim solution. There is going to be some repetitive code.

  // Single out the special case of processing a line that is the final line of a block comment,
  // where the content is under the limit, but the closing comment syntax, with our without the
  // whitespace between the content and the close, is over the limit. In this scenario, there is no
  // need to tokenize the content in order to determine where to split, and there is no need to
  // consider the next line of the comment or the next comment.

  if (previous.comment.type === 'Block' && previous.index === previous.comment.loc.end.line &&
    endIndexOf(previous, 'content') <= threshold) {
    let replacementText = '\n' + previous.lead_whitespace;

    // For javadoc comments, append an extra space so that the asterisks are vertically aligned.

    if (previous.index === previous.comment.loc.start.line && previous.prefix.startsWith('*')) {
      replacementText += ' ';
    }

    const rangeStart = previous.context.code.getIndexFromLoc({
      line: previous.index,
      column: endIndexOf(previous, 'content')
    });

    const rangeEnd = previous.context.code.getIndexFromLoc({
      line: current ? current.index : previous.index,
      // subtract 2 for the close syntax
      column: previous.comment.loc.end.column - previous.close.length
    });

    const report: eslint.Rule.ReportDescriptor = {
      node: previous.context.node,
      loc: {
        start: {
          line: previous.index,
          column: 0
        },
        end: {
          line: previous.index,
          column: previous.comment.loc.end.column
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
  }

  // Handle line comments
  // TODO: support hyphens

  if (previous.comment.type === 'Line') {
    assert(endIndexOf(previous, 'content') > threshold, 'content under threshold');

    // Start by tokenizing the content. We want to determine which words should be moved to the next
    // line. We prefer to move entire words instead of inserting line breaks in the middle of words.
    // We are using logic based on tokens so that we ensure we have the same concept of tokens as
    // the line merge process.

    const tokens = tokenize(previous.content);
    let remaining = endIndexOf(previous, 'content');
    let tokenSplitIndex = -1;

    for (let i = tokens.length - 1; i > -1; i--) {
      const token = tokens[i];

      // If moving this content token to the next line would leave only the prefix remaining for the
      // previous line, it means that we parsed a token that starts immediately after the prefix,
      // which only happens when there is one large token starting the content that itself causes
      // the line to overflow. In this case we do not want to decrement remaining and we do not want
      // to set the index as found. Keep in mind this may not have been the only token on the line,
      // it is just the last visited one that no longer fits, so the index could either be -1 or
      // some later index for some subsequent token that only starts after the threshold. We break
      // here because we know there is no longer a point in looking at earlier tokens and that there
      // are no other tokens so we want to avoid checking other things.

      if (remaining - token.length === endIndexOf(previous, 'prefix')) {
        // we reset the index. if we ran into a big token at the start, it means we are going to
        // have to hard break the token itself, and we no longer care what the index was.
        tokenSplitIndex = -1;
        break;
      }

      // Handle those tokens that are positioned entirely after the threshold. Removing the tokens
      // leading up to this token along with this token are not enough to find a split. We need to
      // continue searching backward. Shift the index, since this is a token that will be moved.
      // Update remaining, since this is a token that will be moved.

      if (remaining - token.length > threshold) {
        tokenSplitIndex = i;
        remaining -= token.length;
        continue;
      }

      // Handle a token that crosses the threshold. Since we are iterating backward, we want to stop
      // searching the first time this condition is true. This is the final token to move.

      if (remaining - token.length <= threshold) {
        tokenSplitIndex = i;
        remaining -= token.length;
        break;
      }
    }

    // Determine the position in content that is being split. If the token index points to a
    // whitespace token, move the break point to after the token. The whitespace token will remain
    // on the previous line as its suffix.

    let contentBreakpoint: number;
    if (tokenSplitIndex === -1) {
      contentBreakpoint = threshold - endIndexOf(previous, 'prefix');
    } else if (tokens[tokenSplitIndex].trim().length === 0) {
      contentBreakpoint = tokens.slice(0, tokenSplitIndex + 1).join('').length;
    } else {
      contentBreakpoint = tokens.slice(0, tokenSplitIndex).join('').length;
    }

    console.debug('content break point:', contentBreakpoint);
    console.log('remaining content: "%s"', previous.content.slice(contentBreakpoint));

    // Determine where to break the previous line (not content).

    let lineBreakpoint: number;
    if (tokenSplitIndex === -1) {
      lineBreakpoint = threshold;
    } else {
      lineBreakpoint = endIndexOf(previous, 'prefix') + contentBreakpoint;
    }

    console.log('line breakpoint:', lineBreakpoint);

    // Now build the replacement text. Since we are moving text into the next line, which might have
    // content, conditionally add in an extra space to ensure the moved text is not immediately
    // adjacent.

    let replacementText = '\n';
    replacementText += previous.lead_whitespace;
    replacementText += previous.open;
    replacementText += previous.prefix;
    replacementText += previous.content.slice(contentBreakpoint);
    if (current && current.content) {
      replacementText += ' ';
    }

    console.log('replacement text: "%s"', replacementText.replace(/\n/, '\\n'));

    // Determime the region of text that is being replaced.

    // We start at the place where we want to insert a new line break.

    const rangeStart = previous.context.code.getIndexFromLoc({
      line: previous.index,
      column: lineBreakpoint
    });

    // Determine the end position of the text that is being replaced. If there is a current line,
    // then the end position is just after the current line's prefix. If there is no current line,
    // then the end position is the end of the previous line. If there is a current line, we also
    // need to inspect whether it is empty. If the current line has content, then we replace into
    // it. If the current line has no content, it is an intentionally empty line, so we do not
    // replace into it, and pretend it does not exist, and insert.

    // TODO: we also need to set end loc conditionally

    let rangeEndLine: number;
    let rangeEndColumn: number;
    let endLocPosition: estree.Position;

    if (current && current.content) {
      rangeEndLine = current.index;
      rangeEndColumn = endIndexOf(current, 'prefix');
      endLocPosition = {
        line: current.index,
        column: current.comment.loc.end.column
      };
    } else {
      rangeEndLine = previous.index;
      rangeEndColumn = endIndexOf(previous, 'suffix');
      endLocPosition = {
        line: previous.index,
        column: previous.text.length
      };
    }

    console.log('range end column:', rangeEndColumn);

    const rangeEnd = previous.context.code.getIndexFromLoc({
      line: rangeEndLine,
      column: rangeEndColumn
    });

    const report: eslint.Rule.ReportDescriptor = {
      node: previous.context.node,
      loc: {
        start: {
          line: previous.index,
          column: 0
        },
        end: endLocPosition
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
  }

  // if (previous.index === previous.comment.loc.start.line &&
  //   previous.index === previous.comment.loc.end.line) {
  //   // This is a one line block comment. We have to be careful about the open/close regions.

  //   replacementText += previous.lead_whitespace;

  //   // If the character after the comment start is *, then this looks like a javadoc comment. The
  //   // new line introduced should have one extra leading space in the lead whitespace region.

  //   if (previous.comment.type === 'Block' && previous.prefix.startsWith('*')) {
  //     replacementText += ' ';
  //   }

  //   replacementText += previous.prefix;

  //   // In the content region, introduce extra leading whitespace equal to the length of the markup.
  //   // We do not copy over the markup, that would cause splitting of list items to create new list
  //   // items, we just want the next line to be indented under the current list item.
  //   // TODO: this is probably wrong, have to be more careful about what gets stored in markup.

  //   replacementText += ''.padEnd(previous.markup.length + previous.markup_space.length);

  //   replacementText += tokenText.trimStart();
  // } else if (previous.index === previous.comment.loc.start.line) {
  //   // This comment starts on the first line of the block comment, but does not end on the first
  //   // line of the block comment.

  //   replacementText += previous.lead_whitespace;

  //   // If the character after the comment start is *, then this looks like a javadoc comment. The
  //   // new line introduced should have one extra leading space in the lead whitespace region.

  //   if (previous.comment.type === 'Block' && previous.prefix.startsWith('*')) {
  //     replacementText += ' ';
  //   }

  //   replacementText += previous.prefix;
  //   replacementText += ''.padEnd(previous.markup.length + previous.markup_space.length);
  //   replacementText += tokenText.trimStart();
  // } else if (previous.index === previous.comment.loc.end.line) {
  //   // The final line of a block comment.

  //   replacementText += previous.lead_whitespace;

  //   if (previous.prefix.startsWith('*')) {
  //     replacementText += previous.prefix;
  //     replacementText += ''.padEnd(previous.markup.length + previous.markup_space.length);
  //   }
  //   replacementText += tokenText.trimStart();
  // } else {
  //   // An intermediate line in a block comment.
  //   replacementText += previous.lead_whitespace;
  //   replacementText += previous.prefix;
  //   replacementText += ''.padEnd(previous.markup.length +  previous.markup_space.length);
  //   replacementText += tokenText.trimStart();
  // }
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
