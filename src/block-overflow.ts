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

  // If the length of the text of the line less the length of the leading whitespace preceding the
  // text is more than the threshold then we refuse to analyze the line because it is unclear how to
  // wrap when every single character is over the line.

  if (line.text.length - line.text_trimmed_start.length >= context.max_line_length) {
    return;
  }

  // Similarly, if the text of the line, less the leading whitespace, combined with the prefix, is
  // over the threshold then we have a javadoc-like comment that only starts after the threshold, so
  // we refuse to analyze the line, because it is unclear how to wrap.

  if (line.text.length - line.text_trimmed_start.length + line.prefix.length >=
    context.max_line_length) {
    return;
  }

  // The previous checks counted trailing whitespace characters. This check does not. For this
  // check, if the line is the last line, then we add back in the trailing whitespace and the
  // comment's ending star slash. For all other lines the suffix is empty.

  if (line.text.length - line.text_trimmed_start.length + line.prefix.length +
    line.content_trimmed.length + line.suffix.length <= context.max_line_length) {
    return;
  }

  // Ignore tslint directives.

  if (line.index === context.comment.loc.start.line && !line.prefix.startsWith('/**') &&
    line.content.startsWith('tslint:')) {
    return;
  }

  // Ignore see tags.

  if (line.content.startsWith('@see')) {
    return;
  }

  // Look for a sub prefix in the content. For example, a markdown list element. Keep in mind that
  // the prefix includes all of its trailing whitespace, so doubly-indented lists look just like
  // singly-indented lists in that both appear at the start of the content. One reason we want to
  // look for this subprefix is because we want to exclude the space that is present following the
  // punctuation (e.g. the trailing space in "* ") from being detected as a candidate break point.
  // The second reason is that when inserting a new line and shifting some text down to the next
  // line, we want to preserve the extra list indentation.

  // For example:
  // * some long line that is a list bullet point
  //   starts here on the next line
  // and not here
  // * and does not start a new list bullet point.

  // The presumption is that the current comment line is not a list.

  // We use a + here instead of a * because I believe markdown only detects a list if there is at
  // least one space following the punctuation. We use a + instead of matching exactly one space so
  // that we can tolerate any number of spaces at the start of the list.

  const listMatches = /^([*-]|\d+\.)\s+/.exec(line.content);
  const subPrefix = (listMatches && listMatches.length > 0) ? listMatches[0] : '';

  // Locate where to insert a line break. We prefer to not break the line in the midst of a word, so
  // we want to search for some whitespace. We have to be careful to not consider the whitespace
  // that is a part of the prefix before the content. We must consider that the content may have
  // trailing whitespace. Once we grab a substring and search it we are getting the offsets in that
  // substring. We want the offset relative to the entire line, but we want to only search a part of
  // it. For now we are only looking at the canonical space, not all whitespace.

  // Find the last character of the last sequence of whitespace characters in the content substring.
  // Keep in mind this is not the position in the line.
  // In order to search for the string, first we have to determine the scope of the search. We do
  // not want to be searching for spaces that occur after the threshold. We have to take into
  // account the length of the sub prefix so that we do not match spaces in the sub prefix.

  const haystackEnd = context.max_line_length - line.text.length - line.text_trimmed_start.length -
    line.prefix.length - subPrefix.length;
  const breakSpaceHaystack = subPrefix.length ?
    line.content_trimmed.slice(subPrefix.length) :
    line.content_trimmed;
  const breakingSpaceSequenceEndPosition = breakSpaceHaystack.lastIndexOf(' ', haystackEnd);

  // We have to consider that we match have matched the last space in a sequence of spaces. Compute
  // the position of the first space in that sequence. It is the same position as the end space when
  // there is only one space.

  let breakingSpaceSequenceStartPosition = breakingSpaceSequenceEndPosition;
  if (breakingSpaceSequenceStartPosition > -1) {
    while (line.content_trimmed.charAt(breakingSpaceSequenceStartPosition - 1) === ' ') {
      breakingSpaceSequenceStartPosition--;
    }
  }

  // Determine the breaking point in the line itself, taking into account whether we found a space.
  // If no breaking point was found then fallback to breaking at the threshold. Note we rule out
  // a space found at 0, that should never happen because that space should belong to the prefix.

  let lineBreakPosition = -1;
  if (breakingSpaceSequenceStartPosition > 0) {
    lineBreakPosition = line.text.length - line.text_trimmed_start.length + line.prefix.length +
      subPrefix.length + breakingSpaceSequenceStartPosition;
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

  if (line.index === context.comment.loc.start.line) {
    textToInsert += line.text.slice(0, line.text.length - line.text_trimmed_start.length);
    if (line.prefix.startsWith('/**')) {
      textToInsert += ' *';
      if (breakingSpaceSequenceStartPosition === -1) {
        textToInsert += ' ';
      }
    }
  } else {
    textToInsert += line.text.slice(0, line.text.length - line.text_trimmed_start.length +
      line.prefix.length);
  }

  if (subPrefix.length > 0) {
    textToInsert += ''.padEnd(subPrefix.length, ' ');
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
