import type eslint from 'eslint';
import { CommentContext } from './comment-context';
import { CommentLine } from './line-data';

export function checkBlockOverflow(context: CommentContext, line: CommentLine) {
  if (!updatePreformattedState(context, line)) {
    return;
  }

  // If the length of the text of the line less its line break characters is less than the threshold
  // then the line does not overflow.

  if (line.text.length <= context.max_line_length) {
    return;
  }

  // If the length of the text of the line less the length of the whitespace preceding the text is
  // more than the threshold then we refuse to analyze the line because it is unclear how to wrap
  // when every single character is over the line.

  if (line.lead_whitespace.length >= context.max_line_length) {
    return;
  }

  // If the text of the line, less the leading whitespace, combined with the prefix, is over the
  // threshold then we have a javadoc-like comment that only starts after the threshold, so we
  // refuse to analyze the line, because it is unclear how to wrap.

  if (line.lead_whitespace.length + line.prefix.length >=
    context.max_line_length) {
    return;
  }

  // Check for overflow considering the suffix.

  if (line.lead_whitespace.length + line.prefix.length +  line.content_trimmed.length +
    line.suffix.length <= context.max_line_length) {
    return;
  }

  // Ignore tslint directives. These are single-leading-star only.

  if (line.index === context.comment.loc.start.line && !line.prefix.startsWith('/**') &&
    line.content.startsWith('tslint:')) {
    return;
  }

  // Ignore see tags.

  if (line.content.startsWith('@see')) {
    return;
  }

  // Check for markdown to help determine where to break the text.

  const listMatches = /^([*-]|\d+\.)\s+/.exec(line.content);
  const mdPrefix = (listMatches && listMatches.length > 0) ? listMatches[0] : '';

  // TODO: this is bugged

  const contentBreakPosition = findContentBreak(line, mdPrefix);

  // Determine the breaking point in the line itself, taking into account whether we found a space.
  // If no breaking point was found then fallback to breaking at the threshold. Note we rule out
  // a space found at 0, that should never happen because that space should belong to the prefix.

  // TODO: this is bugged, it might be the contentBreakPosition though, see test case

  let lineBreakPosition = -1;
  if (contentBreakPosition > 0) {
    lineBreakPosition = line.lead_whitespace.length + line.prefix.length +
      mdPrefix.length + contentBreakPosition;
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

    // When wrapping the last line of the comment we only want to insert prefix characters if there
    // is some non-whitespace non-suffix text after the breakpoint

    if (context.comment.loc.end.column - line.suffix.length < context.max_line_length) {
      if (line.prefix.startsWith('/**')) {
        textToInsert += ' *';
        if (contentBreakPosition === -1) {
          textToInsert += ' ';
        }
      }

      textToInsert += ''.padEnd(mdPrefix.length, ' ');
    }
  } else if (line.index === context.comment.loc.start.line) {
    textToInsert += line.text.slice(0, line.lead_whitespace.length);
    if (line.prefix.startsWith('/**')) {
      textToInsert += ' *';
      if (contentBreakPosition === -1) {
        textToInsert += ' ';
      }
    }
    textToInsert += ''.padEnd(mdPrefix.length, ' ');
  } else if (line.index === context.comment.loc.end.line) {
    textToInsert += line.text.slice(0, line.lead_whitespace.length);
  } else {
    textToInsert += line.text.slice(0, line.lead_whitespace.length + line.prefix.length);
    textToInsert += ''.padEnd(mdPrefix.length, ' ');
  }

  return <eslint.Rule.ReportDescriptor>{
    node: context.node,
    loc: context.comment.loc,
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
 * Detects transitions into and out of a preformatted state in a block comment. Returns true if the
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

/**
 * Return the position where to break in the comment line's content. Returns -1 if no breakpoint
 * found.
 */
function findContentBreak(line: CommentLine, mdPrefix: string) {
  // Compute the region of text in which we will search for a space. We do not want to search the
  // entire text of the line. We want to skip past the leading whitespace before the prefix, the
  // prefix itself, and any markdown prefix should one exist. Similarly, we do not want to consider
  // the whitespace that occurs after the content. The indices here are defined relative to the
  // start of the line (so column 0), not the file, and not parts of the comment.

  // TODO: is this wrong?

  const regionStart = line.lead_whitespace.length + line.prefix.length + mdPrefix.length;
  const regionEnd = regionStart + line.content.length;
  const regionText = line.text.slice(regionStart, regionEnd);
  const endPos = regionText.lastIndexOf(' ');

  // Find the first space in the sequence of whitespace containing the last space.

  let startPos = endPos;
  if (startPos > -1) {
    while (regionText.charAt(startPos - 1) === ' ') {
      startPos--;
    }
  }

  return startPos;
}