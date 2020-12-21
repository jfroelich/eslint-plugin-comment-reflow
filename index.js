const assert = require('assert');

module.exports = {
  rules: {
    comment: {
      meta: {
        type: 'layout',
        fixable: 'whitespace',
        messages: {
          overflow: 'Comment overflows',
          underflow: 'Comment underflows'
        }
      },
      create: createCommentRule
    }
  }
};

/**
 * @param {import('eslint').Rule.RuleContext} context 
 */
function createCommentRule(context) {
  return {
    Program(node) {
      return analyzeProgram(context, node);
    }
  };
}

/**
 * @param {import('eslint').Rule.RuleContext} context 
 * @param {import('eslint').AST.Program} node 
 */
function analyzeProgram(context, node) {
  let maxLineLength = 80;
  if (context.options && context.options.length) {
    maxLineLength = context.options[0];
  }

  assert(Number.isInteger(maxLineLength), 'Invalid option for maximum line length');

  // Iterate over the all the comments. We have to do it this way because apparently comments are
  // not in the AST so no selector is available. Despite iterating over all the comments, however,
  // we do not look for all the errors to correct at once. We only look for the first error and fix
  // that and stop. The individual fixes alias akin to DSP filters to give the illusion of reflow.

  const code = context.getSourceCode();
  const comments = code.getAllComments();
  const commentCount = comments.length;
  let lineRangeStart = 0;

  for (let index = 0; index < commentCount; index++) {
    const comment = comments[index];
    lineRangeStart = comment.range[0];
    let fenced = false;

    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
      if (comment.type === 'Block') {
        const text = code.lines[line - 1];
        if (text.trimStart().startsWith('* ```')) {
          fenced = !fenced;
        }
      }

      let report = null;
      report = createBlockCommentLineOverflowReport(node, code, comment, line, maxLineLength, 
        fenced, lineRangeStart);
      if (report) {
        return context.report(report);
      }

      report = createLineCommentLineOverflowReport(node, code, comment, line, maxLineLength,
        lineRangeStart);
      if (report) {
        return context.report(report);
      }

      report = createBlockCommentLineUnderflowReport(node, code, comment, line, maxLineLength, 
        fenced, lineRangeStart);
      if (report) {
        return context.report(report);
      }

      report = createLineCommentLineUnderflowReport(node, code, comment, index, line, maxLineLength, 
        lineRangeStart);
      if (report) {
        return context.report(report);
      }

      // -1 because line is 1-based, +1 for line break character (assuming just LF)
      lineRangeStart += code.lines[line - 1].length + 1;
    }
  }
}

/**
 * @param {import('eslint').AST.Program} node 
 * @param {import('eslint').SourceCode} code 
 * @param {import('estree').Comment} comment 
 * @param {number} line 
 * @param {number} maxLineLength 
 * @param {number} lineRangeStart
 */
function createLineCommentLineOverflowReport(node, code, comment, line, maxLineLength, 
  lineRangeStart) {
  if (comment.type !== 'Line') {
    return;
  }

  const text = code.lines[line - 1];
  if (text.length <= maxLineLength) {
    return;
  }

  // if there is a comment directive then never overflow

  const content = text.trimStart().slice(2).trimStart();
  if (content.startsWith('eslint-')) {
    return;
  }

  if (content.startsWith('@ts-')) {
    return;
  }

  if (content.startsWith('tslint:')) {
    return;
  }

  // typescript triple slash directive

  if (/^\/\s<(reference|amd)/.test(content)) {
    return;
  }

  const edge = text.lastIndexOf(' ', maxLineLength);

  /** @type {import('eslint').Rule.ReportDescriptor} */
  const report = {};
  report.node = node;
  report.loc = comment.loc;
  report.fix = function (fixer) {
    if (edge === -1) {
      const firstOverflowingCharacter = text.charAt(maxLineLength);
      const insertedText = firstOverflowingCharacter === ' ' ? '\n//' : '\n// ';
      return fixer.insertTextAfterRange([0, lineRangeStart + maxLineLength], insertedText);
    } else {
      const firstOverflowingCharacter = text.charAt(edge);
      const insertedText = firstOverflowingCharacter === ' ' ? '\n//' : '\n// ';
      return fixer.insertTextAfterRange([0, lineRangeStart + edge], insertedText);
    }
  };
  report.messageId = 'overflow';
  report.data = {
    line_length: text.length,
    max_length: maxLineLength
  };
  return report;
}

/**
 * @param {import('eslint').SourceCode} code 
 * @param {import('estree').Comment} comment 
 * @param {number} line 
 * @param {number} maxLineLength 
 * @param {boolean} fenced
 * @param {number} lineRangeStart
 */
function createBlockCommentLineOverflowReport(node, code, comment, line, maxLineLength, fenced,
  lineRangeStart) {
  if (comment.type !== 'Block') {
    return;
  }

  if (fenced) {
    return;
  }

  let text = code.lines[line - 1];
  if (text.length <= maxLineLength) {
    return;
  }

  text = text.trimStart();

  // Do not treat tslint directives as overflowing

  if (line === comment.loc.start.line && text.startsWith('/* tslint:')) {
    return;
  }

  // Find the last space in the line. We have to be careful to exclude the leading space following 
  // an asterisk.

  let edge = -1;
  if (text.startsWith('* ')) {
    edge = text.slice(2).lastIndexOf(' ', maxLineLength - 2);

    // the slice wreaks some havoc on the offset
    if (edge + 3 > maxLineLength) {
      edge = maxLineLength;
    } else if (edge !== -1) {
      edge = edge + 3;
    }
  } else {
    // we trimmed left. we are starting with * or whatever is first text.
    edge = text.lastIndexOf(' ', maxLineLength);
  }

  /** @type {import('eslint').Rule.ReportDescriptor} */
  const report = {};
  report.node = node;
  report.loc = comment.loc;
  report.messageId = 'overflow';
  report.data = {
    line_length: text.length,
    max_length: maxLineLength
  };

  report.fix = function (fixer) {
    const text = code.lines[line - 1];
    if (edge === -1) {
      const firstOverflowingCharacter = text.charAt(maxLineLength);
      const insertedText = firstOverflowingCharacter === ' ' ? '\n*' : '\n* ';
      return fixer.insertTextAfterRange([0, lineRangeStart + maxLineLength], insertedText);
    } else {
      const firstOverflowingCharacter = text.charAt(edge);
      const insertedText = firstOverflowingCharacter === ' ' ? '\n*' : '\n* ';
      return fixer.insertTextAfterRange([0, lineRangeStart + edge], insertedText);
    }
  };

  return report;
}

/**
 * Returns whether the given comment line is a part of a block comment and underflows.
 *
 * @param {import('eslint').AST.Program} node 
 * @param {import('eslint').SourceCode} code the ESLint source code object
 * @param {import('estree').Comment} comment the ESTree Comment token/node/thing
 * @param {number} line the line number of the current line, starting from 1, from the start of the 
 * file
 * @param {number} maxLineLength the threshold for whether a comment is deemed to underflow when
 * evaluating the number of characters in the line
 * @param {boolean} fenced
 * @param {number} lineRangeStart
 */
function createBlockCommentLineUnderflowReport(node, code, comment, line, maxLineLength, fenced,
  lineRangeStart) {
  // Since the logic for handling block and single line comments varies, I figured it would be
  // better to have a helper for each type of comment. But the caller does not know which type of
  // comment they are dealing with, and I do not want to have the caller have the burden to know, so
  // we wait to test the type here.

  if (comment.type !== 'Block') {
    return;
  }

  if (fenced) {
    return;
  }

  // The current line can only underflow when there is a subsequent line. If the current line is the
  // final line of the comment then the current line cannot underflow.

  if (line === comment.loc.end.line) {
    return;
  }

  // Grab the text of the current line. Since the line number is 1-based, but the lines array is
  // 0-based, we must substract one. Do not confuse the value of the line with the comment's value.
  // Also, it looks like ESLint splits by line break to generate the lines array so each line does
  // not include surrounding line breaks so keep in mind that the length of each line is not its
  // actual length. In the case of a block comment, ESLint does not remove leading asterisks, which
  // is different behavior than single line comments, so also watch out for that.

  const text = code.lines[line - 1];

  // If the text length is greater than or equal to the maximum then this is not an underflow. It is
  // possibly overflow, but that is a separate concern.

  if (text.length >= maxLineLength) {
    return;
  }

  // ESLint stripped the line break character(s) from the text. When we consider the length of the 
  // line, we have to consider its line break. If the final character is the line break, then we 
  // actually want 1 before the threshold. Here we are using 1 for line feed, assuming no carriage 
  // return for now. I could merge this with the previous condition but I want to keep it clear for 
  // now.

  if (text.length + 1 === maxLineLength) {
    return;
  }

  // Underflow can only occur if there is content on the current line of the comment. If the line is
  // the initial line of the block comment and does not contain content, or some intermediate
  // line that does not contain content, then do not consider it to underflow.

  const trimmedText = text.trim();
  if (trimmedText === '/*' || trimmedText === '/**' || trimmedText === '*' || trimmedText === '') {
    return;
  }

  // Special handling for jslint directives. According to the docs, the directives can only be
  // specified correctly on the first line of the file, and there cannot be a space between the
  // asterisk and the directive word. In this case the directive itself should not be deemed to 
  // underflow.

  if (line === 1 && /^\/\*(global|jslint|property)/.test(text)) {
    return;
  }

  // If we are not fenced, and the current line is the fence terminator, then the current line 
  // should not be considered underflow.
  if (trimmedText.startsWith('* ```')) {
    return;
  }

  // Get the value of the next line. line is 1-based, so the next line is simply at "line".

  let next = code.lines[line];
  next = next.trim();

  // Underflow can only occur if the next line has some content that we would want to merge into the 
  // current line. If the next line is empty, then the author has created paragraphs, and we want to 
  // not merge paragraphs, only sentences. If the next line looks like the last line and does not 
  // have content, then we want to keep that extra line, because of the javadoc comment style. 
  // We know that there is a next line because we previously checked that the current line is not 
  // the final line.

  if (next === '*' || next == '*/' || next === '') {
    return;
  }

  // Check if the next line contains markdown list syntax.

  if (next.startsWith('* * ') || next.startsWith('* - ') || /^\*\s\d+\.\s/.test(next)) {
    return;
  }

  // Check for markdown header syntax.

  if (/^\*\s#{1,6}/.test(next)) {
    return;
  }

  // Check for markdown table syntax.

  if (next.startsWith('* |') && next.endsWith('|')) {
    return;
  }

  // Check for markdown fence syntax

  if (next.startsWith('* ```')) {
    return;
  }

  // Check for TODO like comments
  if (next.startsWith('* TODO:')) {
    return;
  }

  if (next.startsWith('* WARN:')) {
    return;
  }

  if (next.startsWith('* HACK:')) {
    return;
  }

  if (next.startsWith('* TODO(')) {
    return;
  }

  // Search for the first intermediate whitespace in the next line. Since the '*' stuff is embedded 
  // in the text, we have to skip over that, and we have to skip over the initial space that
  // sometimes follows it.

  let edge = -1;
  if (next.startsWith('* ')) {
    edge = next.indexOf(' ', 3);
  } else if (next.startsWith('*')) {
    edge = next.indexOf(' ', 2);
  } else {
    edge = next.indexOf(' ');
  }

  // If there is no space in the next line, and merging the entire next line with the current line 
  // would cause the current line to overflow, then the current line is not underflowing.

  if (edge === -1 && next.length + text.length > maxLineLength) {
    return;
  }

  // If there is a space in the next line, and merging the text leading up to the space with the
  // current line would cause the current line to overflow, then the current line is not
  // underflowing.

  if (edge !== -1 && edge + text.length > maxLineLength) {
    return;
  }

  // Underflow can only occur if the next line does not look like a JSDoc line. We try to run this 
  // regex last since it is expensive.

  if (/^\s*\*\s+@[a-zA-Z]+/.test(next)) {
    return;
  }

  // return { type: 'underflow', comment, line, edge: edge };

  /** @type {import('eslint').Rule.ReportDescriptor} */
  const report = {};
  report.node = node;
  report.loc = comment.loc;
  report.messageId = 'underflow';
  report.data = {
    line_length: text.length,
    max_length: maxLineLength
  };

  report.fix = function (fixer) {
    const range = [];
    range[0] = lineRangeStart + code.lines[line - 1].length;
    const adjustment = edge === -1 ? 2 : 3;
    range[1] = range[0] + 1 + code.lines[line].indexOf('*') + adjustment;
    return fixer.replaceTextRange(range, ' ');
  };

  return report;
}

/**
 * Returns whether the given comment line is a part of a line comment and underflows.
 * 
 * @param {import('eslint').AST.Program} node 
 * @param {import('eslint').SourceCode} code the ESLint source code object
 * @param {import('estree').Comment} comment the ESTree Comment token/node/thing
 * @param {number} commentIndex the index of the comment in the comments array
 * @param {number} line the line number of the current line, starting from 1, from the start of the 
 * file
 * @param {number} maxLineLength the threshold for whether a comment is deemed to underflow when
 * evaluating the number of characters in the line
 * @param {number} lineRangeStart
 */
function createLineCommentLineUnderflowReport(node, code, comment, commentIndex, line, 
  maxLineLength, lineRangeStart) {
  if (comment.type !== 'Line') {
    return;
  }

  // Get the text of the line. Do not confuse this with comment value. line is 1 based so we 
  // subtract 1 to get the line in the lines array.

  const text = code.lines[line - 1];

  // The comment line only underflows when it is less than the maximum line length.

  if (text.length >= maxLineLength) {
    return;
  }

  // We must consider that eslint stripped out the line break from the text. Therefore, if we count 
  // the line break character itself, and we are right at the threshold, this is not underflow.
  if (text.length + 1 === maxLineLength) {
    return;
  }

  // For a single line comment line to underflow, it cannot be the final comment in the file.
  const comments = code.getAllComments();
  if (commentIndex + 1 === comments.length) {
    return;
  }

  // For a single line comment line to underflow, it must have some content other than the leading 
  // comment syntax.

  const trimmedText = text.trim();
  if (trimmedText === '//') {
    return;
  }

  // If the current single line comment is an eslint pragma kind of comment then never consider it 
  // to underflow.

  const content = trimmedText.slice(2).trimStart();

  if (content.startsWith('eslint-')) {
    return;
  }

  if (content.startsWith('@ts-')) {
    return;
  }

  if (content.startsWith('tslint:')) {
    return;
  }

  // typescript triple slash directive

  if (/^\/\s<(reference|amd)/.test(content)) {
    return;
  }

  // We know this comment is not the final comment. Examine the next comment.

  const next = comments[commentIndex + 1];

  // For a single line comment line to underflow, there must be a subsequent single line comment
  // line. The comments array contains block and single line comments mixed together. If the next
  // comment is not a single line comment then there is a break that prevents merging. We do not
  // merge single lines with blocks.

  if (next.type !== 'Line') {
    return;
  }

  // For a single line comment to underflow, the next comment must be immediately adjacent to the 
  // current comment. Recall that we are iterating over an array of comments that may be spread out 
  // all over the lines array, so the next comment is not guaranteed adjacent. The next comment is 
  // considered adjacent if the difference between the current line number and the next comment's 
  // line number is 1. We could use comment.loc.end.line or line here.

  if (next.loc.start.line - line !== 1) {
    return;
  }

  // Get the text of the next comment line. Line is offset-1, so we just get the text at line.

  const nextCommentLineText = code.lines[line];

  // Find where the comment starts. We cannot assume the comment is at the start of the line as it 
  // could be a trailing comment. We search from the left because we want the first set of slashes, 
  // as any extra slashes are part of the comment's value itself.

  const commentStartPosition = nextCommentLineText.indexOf('//');

  // This should never happen. ESLint told us we have a single line comment.

  assert(commentStartPosition !== -1, `Invalid comment line "${nextCommentLineText}"`);

  // Grab the content of the comment without the text leading up the comment and without the double 
  // forward slashes.

  const nextContent = nextCommentLineText.slice(commentStartPosition + 2);

  // For the current line to underflow, the next line has to have some content other than the 
  // comment syntax or else we assume the author wants to prevent merging, such as forcing a new 
  // paragraph.

  if (!nextContent) {
    return;
  }
  
  const nextContentLeftTrimmed = nextContent.trimStart();

  // For the current line to underflow, the next line has to have some content other than comment 
  // syntax and also other than just whitespace.

  if (!nextContentLeftTrimmed) {
    return;
  }

  // If there is an lint pragma on the next line, then deem the current line to not underflow,
  // because the next line should not be merged. Recall that here we are working with the comment
  // value, not the line text. The comment value already removed the '//'.

  if (nextContentLeftTrimmed.startsWith('eslint-')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('@ts-')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('tslint:')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('TODO:')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('WARN:')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('HACK:')) {
    return;
  }

  if (nextContentLeftTrimmed.startsWith('TODO(')) {
    return;
  }

  // To support word wrap, we want to consider whether the next line can be merged into the current 
  // line based on whether the first word or two will fit. So we want to find the maximum number of 
  // tokens we can grab from the next line and merge into the current line. At the moment this is 
  // rudimentary and looking at just one token at a time, but I will eventually improve this. So, 
  // in order to find the first word break, we want to search for the break, but starting from a 
  // position that excludes the initial leading whitespace in the next line comment content. To 
  // exclude that leading whitespace we first have to measure the number of leading whitespace 
  // characters.

  const leadingSpaceCount = nextContent.length - nextContentLeftTrimmed.length;

  // Look for the offset of the first word break in the next line content, starting from the 
  // position after the leading whitespace.

  const edge = nextContent.indexOf(' ', leadingSpaceCount);

  // If there is no intermediate whitespace in the next line then the entire next line needs to be
  // able to merged with the current line. We simply need to add it the length of the current
  // line. If the sum of the two is greater than the total preferred text length per line, then we
  // treat the current line as not underflowing.

  if (edge === -1 && nextContent.length + text.length > maxLineLength) {
    console.debug('no space found in next line, next line does not fit');
    return;
  }

  // If there is a space in the next line, check if the characters preceding that space can be added
  // to the current line text. If shifting the characters would cause the current line to overflow,
  // then the current line is not considered underflow.

  if (edge !== -1 && edge + text.length > maxLineLength) {
    console.debug('space found in next line but does not fit current line "%s"', text,
      edge + text.length);
    return;
  }

  console.debug('determined edge and that it fits', edge, text.length, edge + text.length);

  /** @type {import('eslint').Rule.ReportDescriptor} */
  const report = {};
  report.node = node;
  report.loc = comment.loc;
  report.messageId = 'underflow';
  report.data = {
    line_length: text.length,
    max_length: maxLineLength
  };

  report.fix = function (fixer) {
    const range = [];
    range[0] = lineRangeStart + code.lines[line - 1].length;
    const adjustment = edge === -1 ? 2 : 3;
    range[1] = range[0] + 1 + code.lines[line].indexOf('//') + adjustment;
    return fixer.replaceTextRange(range, ' ');
  };

  return report;
}
