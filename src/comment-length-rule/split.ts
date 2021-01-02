import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';
import { CommentLine, containsJSDocTag, containsMarkdownList, endIndexOf, isLeadWhitespaceAligned, tokenize } from './util';

export function split(current: CommentLine, next?: CommentLine) {
  if (next) {
    assert(current.index + 1 === next.index,
      `Line ${current.index} does not immediately precede line ${next.index}`);
  }

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

  if (current.index === current.comment.loc.end.line && endIndexOf(current, 'close') <= threshold) {
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

  const tokens = tokenize(current.content);
  const tokenSplitIndex = findTokenSplit(current, tokens);
  const contentBreakpoint = findContentBreak(current, tokens, tokenSplitIndex);
  const lineBreakpoint = findLineBreak(current, tokenSplitIndex, contentBreakpoint);
  const replacementText = composeReplacementText(current, contentBreakpoint, next);

  const loc = createLoc(current, next);
  const range = createReplacementRange(current, lineBreakpoint, next);

  const report: eslint.Rule.ReportDescriptor = {
    node: current.context.node,
    loc,
    messageId: 'split',
    data: {
      line_length: `${current.text.length}`,
      max_length: `${current.context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.replaceTextRange(range, replacementText);
    }
  };

  return report;
}

function createLoc(current: CommentLine, next: CommentLine) {
  // special case for last line of block comment with content under limit and suffix over limit
  if (current.comment.type === 'Block' && current.index === current.comment.loc.end.line &&
    endIndexOf(current, 'content') <= current.context.max_line_length) {

    return <eslint.AST.SourceLocation>{
      start: {
        line: current.index,
        column: 0
      },
      end: {
        line: current.index,
        column: current.comment.loc.end.column
      }
    };
  }

  // We have to check if the lead whitespace aligns. If not, we will not be merging into the next
  // line and will only be creating a new one.

  let endLocPosition: estree.Position;
  if (willSplitMerge(current, next)) {
    endLocPosition = {
      line: next.index,
      column: next.text.length
    };
  } else {
    endLocPosition = {
      line: current.index,
      column: current.text.length
    };
  }

  return <eslint.AST.SourceLocation>{
    start: {
      line: current.index,
      column: 0
    },
    end: endLocPosition
  };
}

function willSplitMerge(current: CommentLine, next?: CommentLine) {
  if (!next) {
    return false;
  }

  if (!next.content) {
    return false;
  }

  if (next.directive) {
    return false;
  }

  if (next.fixme) {
    return false;
  }

  if (!isLeadWhitespaceAligned(current, next)) {
    return false;
  }

  if (containsMarkdownList(next)) {
    return false;
  }

  if (containsJSDocTag(next)) {
    return false;
  }

  return true;
}

function createReplacementRange(current: CommentLine, lineBreakpoint: number, next?: CommentLine) {
  // Special case for last line of block comment with content under limit and suffix over limit
  if (current.comment.type === 'Block' && current.index === current.comment.loc.end.line &&
    endIndexOf(current, 'content') <= current.context.max_line_length) {
    const rangeStart = current.context.code.getIndexFromLoc({
      line: current.index,
      column: endIndexOf(current, 'content')
    });

    // TODO: i think i would prefer to use endIndexOf(current, 'suffix') here for consistency?

    const rangeEnd = current.context.code.getIndexFromLoc({
      line: next ? next.index : current.index,
      // subtract 2 for the close syntax
      column: current.comment.loc.end.column - current.close.length
    });
    return <eslint.AST.Range>[rangeStart, rangeEnd];
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

  if (willSplitMerge(current, next)) {
    rangeEndLine = next.index;
    rangeEndColumn = endIndexOf(next, 'prefix');
  } else {
    rangeEndLine = current.index;
    rangeEndColumn = endIndexOf(current, 'suffix');
  }

  const rangeEnd = current.context.code.getIndexFromLoc({
    line: rangeEndLine,
    column: rangeEndColumn
  });

  return <eslint.AST.Range>[rangeStart, rangeEnd];
}

function findTokenSplit(current: CommentLine, tokens: string[]) {
  const endOfPrefix = endIndexOf(current, 'prefix');

  let remaining = endIndexOf(current, 'content');
  let tokenSplitIndex = -1;

  // Edge case for trailing whitespace in last line of block comment.

  if (current.comment.type === 'Block' && current.index === current.comment.loc.end.line &&
    remaining <= current.context.max_line_length) {
    return - 1;
  }

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

    if (remaining - token.length === endOfPrefix) {
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
    remaining - tokens[tokenSplitIndex - 1].length > endOfPrefix) {
    tokenSplitIndex--;
  }

  return tokenSplitIndex;
}

/**
 * Determine the splitting position in the content. If the token index points to a whitespace token,
 * move the position to after the token. The whitespace token will remain on the current line as its
 * suffix. This position is relative to the start of the content.
 */
function findContentBreak(current: CommentLine, tokens: string[], tokenSplitIndex: number) {
  // edge case for last line of block comment
  if (current.comment.type === 'Block' && current.index === current.comment.loc.end.line &&
    endIndexOf(current, 'content') <= current.context.max_line_length) {
    return -1;
  }

  let contentBreakpoint: number;
  if (tokenSplitIndex === -1) {
    contentBreakpoint = current.context.max_line_length - endIndexOf(current, 'prefix');
  } else if (tokens[tokenSplitIndex].trim().length === 0) {
    contentBreakpoint = tokens.slice(0, tokenSplitIndex + 1).join('').length;
  } else {
    contentBreakpoint = tokens.slice(0, tokenSplitIndex).join('').length;
  }

  return contentBreakpoint;
}

function findLineBreak(current: CommentLine, tokenSplitIndex: number, contentBreakpoint: number) {
  // edge case for last line of block where content under limit but suffix over limit
  if (current.comment.type === 'Block' && current.index === current.comment.loc.end.line &&
    endIndexOf(current, 'content') <= current.context.max_line_length) {
    return -1;
  }

  let lineBreakpoint: number;

  // Determine where to break the line.

  if (tokenSplitIndex === -1) {
    lineBreakpoint = current.context.max_line_length;
  } else {
    lineBreakpoint = endIndexOf(current, 'prefix') + contentBreakpoint;
  }

  return lineBreakpoint;
}

function composeReplacementText(current: CommentLine, contentBreakpoint: number,
  next?: CommentLine) {
  let replacementText = current.context.line_break + current.lead_whitespace;

  if (current.comment.type === 'Line') {
    replacementText += current.open;
  }

  // Vertically align the asterisk in the new line when splitting first line of javadoc since the
  // lead whitespace by itself is not enough, all lines for proper javadoc other than the first have
  // an extra leading space.

  if (current.index === current.comment.loc.start.line && current.prefix.startsWith('*')) {
    replacementText += ' ';
  }

  // Special case for last line of block comment where content under limit but suffix/close over
  // limit

  if (current.comment.type === 'Block' && current.index === current.comment.loc.end.line &&
    endIndexOf(current, 'content') <= current.context.max_line_length) {
    return replacementText;
  }

  replacementText += current.prefix;
  replacementText += current.content.slice(contentBreakpoint);

  replacementText += current.suffix;

  if (willSplitMerge(current, next)) {
    // Keep the text moved from the current line into the next line separated from the existing text
    // of the next line.
    replacementText += ' ';
  }

  return replacementText;
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
