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

  // TEMP: disabled at the moment, not yet in use, will be very soon
  // const precedingWhitespaceLength = text.length - textTrimmedStart.length;

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

  // Do not treat tslint directives as overflowing. tslint directives are expressed on a single line
  // of the block comment (at least that is what I understand). Since we could be on any line of the
  // comment, we want to check if we are on the first line of the comment. We tolerate leading
  // whitespace before the comment.

  if (context.line === context.comment.loc.start.line && !prefix.startsWith('/**') &&
    content.startsWith('tslint:')) {
    return;
  }

  ////////////////////////////////////////////////////////////////////////////////////
  // AFTER THIS LINE IS OLDER CODE ABOUT TO BE REVISED

  // Find the last space in the line. We have to be careful to exclude the leading space following
  // an asterisk.

  let edge = -1;
  if (textTrimmedStart.startsWith('* ')) {
    edge = textTrimmedStart.slice(2).lastIndexOf(' ', context.max_line_length - 2);

    // the slice wreaks some havoc on the offset
    if (edge + 3 > context.max_line_length) {
      edge = context.max_line_length;
    } else if (edge !== -1) {
      edge = edge + 3;
    }
  } else {
    edge = textTrimmedStart.lastIndexOf(' ', context.max_line_length);
  }

  // Compute the range of the text after which we will insert some new text.
  // TODO: look at getIndexFromLoc

  let insertAfterRange: eslint.AST.Range;
  if (edge === -1) {
    insertAfterRange = [0, lineStartIndex + context.max_line_length];
  } else {
    insertAfterRange = [0, lineStartIndex + edge];
  }

  // Build the text to insert.

  const firstOverflowingCharacter = edge === -1 ?
    text.charAt(context.max_line_length) : text.charAt(edge);
  const textToInsert = firstOverflowingCharacter === ' ' ? '\n*' : '\n* ';

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