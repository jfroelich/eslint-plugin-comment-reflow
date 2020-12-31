import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { CommentLine, endIndexOf, tokenize } from './util';

export function split(current: CommentLine, next?: CommentLine) {
  assert(!next || current.index + 1 === next.index,
    `Line ${current.index} does not immediately precede line ${next.index}`);

  if (!updatePreformattedState(current)) {
    return;
  }

  const threshold = current.context.max_line_length;

  if (current.text.length <= threshold) {
    return;
  }

  if (current.lead_whitespace.length >= threshold) {
    return;
  }

  if (endIndexOf(current, 'open') >= threshold) {
    return;
  }

  if (endIndexOf(current, 'prefix') >= threshold) {
    return;
  }

  if (current.index < current.comment.loc.end.line &&
    endIndexOf(current, 'content') <= threshold) {
    return;
  }

  if (current.index === current.comment.loc.end.line &&
    endIndexOf(current, 'close') <= threshold) {
    return;
  }

  // Handle a peculiar edge case of trailing whitespace. It is possible that the current line's text
  // is visibly under the limit, but the trailing whitespace pushes the end position of the current
  // line's text over the limit. This only applies when the whitespace is not visibly part of the
  // content, meaning that this applies to all situations other than the final line of a block
  // comment because that is the only situation where there is closing syntax.

  if ((current.comment.type === 'Line' || current.index !== current.comment.loc.end.line) &&
    endIndexOf(current, 'content') <= threshold && endIndexOf(current, 'suffix') > threshold) {
    return;
  }

  if (current.directive) {
    return;
  }

  if (current.comment.type === 'Block' && current.prefix.startsWith('*') &&
    current.markup.startsWith('@see')) {
    return;
  }

  // TODO: I want to eventually use one approach for all of the scenarios. However, each scenario
  // has idiosyncratic concerns, causing complexity. For now, I am going to solve the scenarios one
  // at a time, get a minimally working example, and then hunt for commonality.

  // Single out the special case of processing a line that is the final line of a block comment,
  // where the content is under the limit, but the closing comment syntax, with or without the
  // whitespace between the content and the close, is over the limit. In this scenario, there is no
  // need to tokenize the content in order to determine where to split, and there is no need to
  // consider the next line of the comment or the next comment.

  if (current.comment.type === 'Block' && current.index === current.comment.loc.end.line &&
    endIndexOf(current, 'content') <= threshold) {
    let replacementText = '\n' + current.lead_whitespace;

    // For javadoc comments, append an extra space so that the asterisks are vertically aligned.

    if (current.index === current.comment.loc.start.line && current.prefix.startsWith('*')) {
      replacementText += ' ';
    }

    const rangeStart = current.context.code.getIndexFromLoc({
      line: current.index,
      column: endIndexOf(current, 'content')
    });

    const rangeEnd = current.context.code.getIndexFromLoc({
      line: next ? next.index : current.index,
      // subtract 2 for the close syntax
      // TODO: i think i would prefer to use endIndexOf(current, 'suffix') here for consistency?
      column: current.comment.loc.end.column - current.close.length
    });

    const report: eslint.Rule.ReportDescriptor = {
      node: current.context.node,
      loc: {
        start: {
          line: current.index,
          column: 0
        },
        end: {
          line: current.index,
          column: current.comment.loc.end.column
        }
      },
      messageId: 'split',
      data: {
        line_length: `${current.text.length}`,
        max_length: `${current.context.max_line_length}`
      },
      fix: function (fixer) {
        return fixer.replaceTextRange([rangeStart, rangeEnd], replacementText);
      }
    };

    return report;
  }

  // Handle line comments

  if (current.comment.type === 'Line') {
    assert(endIndexOf(current, 'content') > threshold, 'content under threshold');

    const tokens = tokenize(current.content);
    const tokenSplitIndex = findTokenSplit(current, tokens);

    // Determine the splitting position in the content. If the token index points to a whitespace
    // token, move the position to after the token. The whitespace token will remain on the current
    // line as its suffix. This position is relative to the start of the content.

    let contentBreakpoint: number;
    if (tokenSplitIndex === -1) {
      contentBreakpoint = threshold - endIndexOf(current, 'prefix');
    } else if (tokens[tokenSplitIndex].trim().length === 0) {
      contentBreakpoint = tokens.slice(0, tokenSplitIndex + 1).join('').length;
    } else {
      contentBreakpoint = tokens.slice(0, tokenSplitIndex).join('').length;
    }

    // Determine where to break the line.

    let lineBreakpoint: number;
    if (tokenSplitIndex === -1) {
      lineBreakpoint = threshold;
    } else {
      lineBreakpoint = endIndexOf(current, 'prefix') + contentBreakpoint;
    }

    // Compose the replacement text. Since we are moving text into the next line, which might have
    // content, conditionally add in an extra space to ensure the moved text is not immediately
    // adjacent.

    let replacementText = '\n';
    replacementText += current.lead_whitespace;
    replacementText += current.open;
    replacementText += current.prefix;
    replacementText += current.content.slice(contentBreakpoint);
    if (next && next.content) {
      replacementText += ' ';
    }

    // Determime the region of text that is being replaced. Start at the place where we want to
    // insert a new line break.

    const rangeStart = current.context.code.getIndexFromLoc({
      line: current.index,
      column: lineBreakpoint
    });

    // Determine the end position of the text that is being replaced. If there is a next line,
    // then the end position is just after the next line's prefix. If there is no next line,
    // then the end position is the end of the current line. If there is a next line, we also
    // need to inspect whether it is empty. If the next line has content, then we replace into
    // it. If the next line has no content, it is an intentionally empty line, so we do not
    // replace into it, and pretend it does not exist, and insert, and in this manner, we preserve
    // the empty line and preserve author intent.

    let rangeEndLine: number;
    let rangeEndColumn: number;
    let endLocPosition: estree.Position;

    if (next && next.content) {
      rangeEndLine = next.index;
      rangeEndColumn = endIndexOf(next, 'prefix');
      endLocPosition = {
        line: next.index,
        column: next.comment.loc.end.column
      };
    } else {
      rangeEndLine = current.index;
      rangeEndColumn = endIndexOf(current, 'suffix');
      endLocPosition = {
        line: current.index,
        column: current.text.length
      };
    }

    const rangeEnd = current.context.code.getIndexFromLoc({
      line: rangeEndLine,
      column: rangeEndColumn
    });

    const report: eslint.Rule.ReportDescriptor = {
      node: current.context.node,
      loc: {
        start: {
          line: current.index,
          column: 0
        },
        end: endLocPosition
      },
      messageId: 'split',
      data: {
        line_length: `${current.text.length}`,
        max_length: `${current.context.max_line_length}`
      },
      fix: function (fixer) {
        return fixer.replaceTextRange([rangeStart, rangeEnd], replacementText);
      }
    };

    return report;
  }
}

function findTokenSplit(current: CommentLine, tokens: string[]) {
  let remaining = endIndexOf(current, 'content');
  let tokenSplitIndex = -1;

  for (let i = tokens.length - 1; i > -1; i--) {
    const token = tokens[i];

    // If moving this content token to the next line would leave only the prefix remaining for the
    // current line, it means that we parsed a token that starts immediately after the prefix,
    // which only happens when there is one large token starting the content that itself causes
    // the line to overflow. In this case we do not want to decrement remaining and we do not want
    // to set the index as found. Keep in mind this may not have been the only token on the line,
    // it is just the last visited one that no longer fits, so the index could either be -1 or
    // some later index for some subsequent token that only starts after the threshold. We break
    // here because we know there is no longer a point in looking at earlier tokens and that there
    // are no other tokens so we want to avoid checking other things.

    if (remaining - token.length === endIndexOf(current, 'prefix')) {
      // we reset the index. if we ran into a big token at the start, it means we are going to
      // have to hard break the token itself, and since later code relies on this, we want to
      // ensure we report not found.
      tokenSplitIndex = -1;
      break;
    }

    // Handle those tokens that are positioned entirely after the threshold. Removing the tokens
    // leading up to this token along with this token are not enough to find a split. We need to
    // continue searching backward. Shift the index, since this is a token that will be moved.
    // Update remaining, since this is a token that will be moved.

    if (remaining - token.length > current.context.max_line_length) {
      tokenSplitIndex = i;
      remaining -= token.length;
      continue;
    }

    // Handle a token that crosses the threshold. Since we are iterating backward, we want to stop
    // searching the first time this condition is true. This is the final token to move.

    if (remaining - token.length <= current.context.max_line_length) {
      tokenSplitIndex = i;
      remaining -= token.length;
      break;
    }
  }

  // Account for soft break preceding hyphenated word.

  if (tokenSplitIndex > 0 && tokens[tokenSplitIndex] === '-' &&
    remaining - tokens[tokenSplitIndex - 1].length > endIndexOf(current, 'prefix')) {
    tokenSplitIndex--;
  }

  return tokenSplitIndex;
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
