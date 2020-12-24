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

  // TODO: limit prefix to have at most one trailing space, and detect post prefix whitespace
  // preceding content as a separate variable

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
    if (content.startsWith('```')) {
      context.in_markdown_fence = false;

      // never detect overflow on the line exiting from markdown fence
      return;
    } else {
      // never detect overflow while in markdown fence
      return;
    }
  } else if (context.in_jsdoc_example) {
    if (content.startsWith('@')) {
      context.in_jsdoc_example = false;
      // do not return, this line is not part of example, still want to detect overflow
    } else {
      // never detect overflow while in jsdoc example
      return;
    }
  } else if (content.startsWith('```')) {
    context.in_markdown_fence = true;

    // do not detect overflow on the line entering markdown fence
    return;
  } else if (content.startsWith('@example')) {
    context.in_jsdoc_example = true;
    // do not deetect overflow on the line entering jsdoc example
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
    console.debug('too much leading whitespace to even consider overflow on line', context.line);
    return;
  }

  if (lengthOfWhiteSpacePrecedingComment + prefix.length >= context.max_line_length) {
    console.debug('too much leading whitespace together with comment prefix to even consider overflow on line',
      context.line);
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

  // In order to search for the string, first we have to determine the scope of the search. We do
  // not want to be searching for spaces that occur after the threshold.

  const haystackEnd = context.max_line_length - lengthOfWhiteSpacePrecedingComment - prefix.length;

  // Find a space in the content substring. Keep in mind this is not the position in the line.

  let contentBreakingSpacePosition = contentTrimmedEnd.lastIndexOf(' ', haystackEnd);

  // We have to consider that we match have matched the last space in a sequence of spaces. But we
  // want the position of the first space in that sequence.

  if (contentBreakingSpacePosition > -1) {
    while (contentTrimmedEnd.charAt(contentBreakingSpacePosition - 1) === ' ') {
      console.debug('subtracting 1 space');
      contentBreakingSpacePosition--;
    }
  }

  // Determine the breaking point in the line itself, taking into account whether we found a space.
  // If no breaking point was found then fallback to breaking at the threshold. Note we rule out
  // a space found at 0, that should never happen because that space should belong to the prefix.

  let lineBreakPosition = -1;
  if (contentBreakingSpacePosition > 0) {
    // TODO: this might be off by 1?
    lineBreakPosition = lengthOfWhiteSpacePrecedingComment + prefix.length +
      contentBreakingSpacePosition;
  } else {
    lineBreakPosition = context.max_line_length;
  }

  console.debug('Line %d should be split at position %d, remainder is "%s"', context.line,
    lineBreakPosition, text.slice(lineBreakPosition));

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

  const textToInsert = '\n' + text.slice(0, lengthOfWhiteSpacePrecedingComment + prefix.length);

  console.debug('text to insert "%s"', textToInsert.replace(/\n/g, '\\n'));

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