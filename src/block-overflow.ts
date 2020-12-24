import type eslint from 'eslint';
import { CommentContext } from './comment-context';

export function createBlockCommentLineOverflowReport(context: CommentContext) {
  // Get the text of the current line. The line is 1-based but the index of the line in the lines
  // array is 0 based. The text does not include line break characters because of how ESLint parses
  // the lines. The text may include characters that are not a part of the comment because the lines
  // array is computed separately from the comments array. The text includes the comment syntax like
  // the forward slashes. We assume that the caller checked that the comment is the first token on
  // the line where the comment starts, so here we know that any text preceding the start of the
  // comment on the line is only whitespace.

  const text = context.code.lines[context.line - 1];

  // Determine the index of the current line. The term "index" here aligns with what ESLint
  // sometimes refers to in various places in its API which is basically the offset of the first
  // character of the line relative to the first character in the entire file, which has index 0.

  // An alternative approach to calculating this value would be to sum up the lengths of the
  // previous lines. But it turns out that approach has not so obvious complexity. We do not have
  // easy access to the line breaks in use. The API call here is better because it properly accounts
  // for line breaks in the same way as the rest of ESLint.

  const lineStartIndex = context.code.getIndexFromLoc({ line: context.line, column: 0 });

  // Determine the amount of whitespace preceding the comment on the current line. We do this so
  // that we can figure out where the content of the comment actually starts. We need to consider
  // the leading whitespace for several reasons. We can use the indent level combined with the line
  // start index to find the starting position of the comment's content. One particular reason is
  // that we need to limit the search space when deciding where to break the line, because if we
  // search for a word break backwards from the end of the line we can erroneously match the
  // whitespace preceding the content. In determining the indent, keep in mind that we already
  // verified that there is no preceding token on the same line if we are on the first line of the
  // comment. The driving principle is that we use the amount of preceding whitespace of the current
  // line to determine the appropriate amount of preceding whitespace to specify for the new line
  // that we plan to introduce. We do not try to maintain the indent relative to only the first line
  // of the comment because this way we can uniformly handle lines that have different indentation.

  // In calculating the amount of preceding whitespace, we could use a regex, but I want to minimize
  // the uses of regex.
  // TODO: but since we are using a regex for the prefix we can probably just use a capture in that
  // regex to accomplish this?

  const textTrimmedStart = text.trimStart();

  // Next, compute the start of the content within the comment line by determining the length of
  // what I refer to as the "prefix". The prefix length may be zero. For the first line, we have to
  // consider the slash, star or stars, and subsequent whitespace. For other lines, we have to
  // consider the star and or subsequent whitespace.

  let prefix = '';
  if (context.line === context.comment.loc.start.line) {
    const matches = /\/\*\*?\s*/.exec(textTrimmedStart);
    if (matches && matches.length === 1) {
      prefix = matches[0];
    }
  } else {
    const matches = /\*\s*/.exec(textTrimmedStart);
    if (matches && matches.length === 1) {
      prefix = matches[0];
    }
  }

  // Determine the content of the line of the comment, which is the text excluding comment syntax,
  // indentation, and prefix. In doing so, we have to watch out for the final line of the comment
  // that has the closing asterisk and slash. Keep in mind that while the whitespace preceding the
  // content here has was excluded, we have not yet excluded the whitespace after the content.

  let content = '';
  if (context.line === context.comment.loc.end.line) {
    content = textTrimmedStart.slice(prefix.length, -2);
  } else {
    content = textTrimmedStart.slice(prefix.length);
  }

  // Before doing any more decision making, we have to start with considering the special case of
  // preformatted content, such as when using triple tilde markdown or the @example jsdoc tag. When
  // in a preformatted section of the content, we respect the author's formatting and bail. First we
  // need to detect if we are entering into or exiting from a preformatted section. We can only
  // enter into markdown fence when not in jsdoc example. We can only enter into jsdoc example when
  // not in markdown fence.

  // TODO: is it only correct to check for markdown when in a javadoc-style comment?

  if (context.in_markdown_fence) {
    if (context.line > context.comment.loc.start.line && content.startsWith('```')) {
      context.in_markdown_fence = false;
      // never detect overflow on the line exiting from markdown fence
      return;
    } else {
      // never detect overflow while in markdown fence
      return;
    }
  } else if (context.in_jsdoc_example) {
    if (content.startsWith('@')) {
      if (content.startsWith('@example')) {
        // never detect overflow if there is a subsequent example
        return;
      } else {
        context.in_jsdoc_example = false;
        // do not return, we are no longer in an example
      }
    } else {
      // never detect overflow while in jsdoc example
      return;
    }
  } else if (context.line > context.comment.loc.start.line && content.startsWith('```')) {
    context.in_markdown_fence = true;
    // never detect overflow on the line entering markdown fence
    return;
  } else if (context.line > context.comment.loc.start.line && content.startsWith('@example')) {
    context.in_jsdoc_example = true;
    // never detect overflow on the line entering jsdoc example
    return;
  }

  // If the text of the line, less its line break characters, is less than the threshold then the
  // line does not overflow.  Keep in mind that this counts tab characters as a single character.
  // Also keep in mind that the authors may not be making use of the no-trailing-space rule, so
  // there may be a bunch of garbage whitespace at the end. So this check here isn't telling us that
  // the line requires adjustment. It is only ruling out the case where it does not need adjustment
  // even with a bunch of trailing whitespace. We have to wait to do this check until after the
  // preformat check, otherwise we never get around to detecting when we exit or enter the step?

  if (text.length <= context.max_line_length) {
    return;
  }

  const lengthOfWhiteSpacePrecedingComment = text.length - textTrimmedStart.length;

  if (lengthOfWhiteSpacePrecedingComment >= context.max_line_length) {
    return;
  }

  if (lengthOfWhiteSpacePrecedingComment + prefix.length >= context.max_line_length) {
    return;
  }

  // Do not treat tslint directives as overflowing. tslint directives are expressed on a single line
  // of the block comment (at least that is what I understand). Since we could be on any line of the
  // comment, we want to check if we are on the first line of the comment. We tolerate leading
  // whitespace before the comment.

  if (context.line === context.comment.loc.start.line && !prefix.startsWith('/**') &&
    content.startsWith('tslint:')) {
    return;
  }

  // Do not treat @see jsdoc as overflowing. @see tends to contain large hyperlinks and we generally
  // do not want to split such hyperlinks. I'd rather not parse urls here and pay for all that
  // overhead to be able to wrap @see lines so just exit.

  if (content.startsWith('@see')) {
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

  let subPrefix = '';

  // We use a + here instead of a * because I believe markdown only detects a list if there is at
  // least one space following the punctuation. We use a + instead of matching exactly one space so
  // that we can tolerate any number of spaces at the start of the list.

  const listMatches = /^([*-]|\d+\.)\s+/.exec(content);
  if (listMatches && listMatches.length > 0) {
    subPrefix = listMatches[0];
  }

  // Locate where to insert a line break. We prefer to not break the line in the midst of a word, so
  // we want to search for some whitespace. This is a bit tricky. First, we have to be careful to
  // not consider the whitespace that is a part of the prefix before the content. Second, we must
  // consider that the content may have trailing whitespace. Third, we have to consider that the
  // JavaScript standard library does not give us any nice tool to do this. Once we grab a substring
  // and search it we are getting the offsets in that substring. We want the offset relative to the
  // entire line, but we want to only search a part of it. For now we are only looking at the
  // canonical space because for now I prefer not to use a regex.

  // To avoid considering trailing whitespace, trim the end of the content.

  const contentTrimmedEnd = content.trimEnd();

  // Now that we trimmed the end of the content, we want to again check for whether we actually
  // overflow. The previous check counted trailing whitespace characters. This check does not.

  if ((lengthOfWhiteSpacePrecedingComment + prefix.length + contentTrimmedEnd.length) <=
    context.max_line_length) {
    return;
  }

  // In order to search for the string, first we have to determine the scope of the search. We do
  // not want to be searching for spaces that occur after the threshold.

  const haystackEnd = context.max_line_length - lengthOfWhiteSpacePrecedingComment - prefix.length -
    subPrefix.length;

  // We have to take into account the length of the sub prefix so that we do not match spaces in the
  // sub prefix.

  let haystack = contentTrimmedEnd;
  if (subPrefix.length) {
    haystack = contentTrimmedEnd.slice(subPrefix.length);
  }

  // Find the last character of the last sequence of whitespace characters in the content substring.
  // Keep in mind this is not the position in the line.

  const contentBreakingSpaceSequenceEndPosition = haystack.lastIndexOf(' ', haystackEnd);

  // We have to consider that we match have matched the last space in a sequence of spaces. Compute
  // the position of the first space in that sequence. It is the same position as the end space when
  // there is only one space.

  let contentBreakingSpaceSequenceStartPosition = contentBreakingSpaceSequenceEndPosition;
  if (contentBreakingSpaceSequenceStartPosition > -1) {
    while (contentTrimmedEnd.charAt(contentBreakingSpaceSequenceStartPosition - 1) === ' ') {
      contentBreakingSpaceSequenceStartPosition--;
    }
  }

  // Determine the breaking point in the line itself, taking into account whether we found a space.
  // If no breaking point was found then fallback to breaking at the threshold. Note we rule out
  // a space found at 0, that should never happen because that space should belong to the prefix.

  let lineBreakPosition = -1;
  if (contentBreakingSpaceSequenceStartPosition > 0) {
    lineBreakPosition = lengthOfWhiteSpacePrecedingComment + prefix.length + subPrefix.length +
      contentBreakingSpaceSequenceStartPosition;
  } else {
    lineBreakPosition = context.max_line_length;
  }

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

  // TODO: do not copy over the prefix as is if it is line 1, that will put a slash in the wrong
  // place. we want to mimic what vscode does i think. look at prefix style and line to decide
  // how to add a prefix to the next line.

  let textToInsert = '\n' + text.slice(0, lengthOfWhiteSpacePrecedingComment + prefix.length);

  if (subPrefix.length > 0) {
    textToInsert += ''.padEnd(subPrefix.length, ' ');
  }

  return <eslint.Rule.ReportDescriptor>{
    node: context.node,
    loc: context.comment.loc,
    messageId: 'overflow',
    data: {
      line_length: `${text.length}`,
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      return fixer.insertTextAfterRange(insertAfterRange, textToInsert);
    }
  };
}