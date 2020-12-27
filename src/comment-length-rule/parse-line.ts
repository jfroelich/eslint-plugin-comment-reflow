import eslint from 'eslint';
import estree from 'estree';
import { CommentLineDesc } from './comment-line-desc';

/**
 * @todo since our primary logic branches on one of five situations, we should organize the code
 * around those five situations, not based on which part of the line we are parsing.
 */

export function parseLine(code: eslint.SourceCode, comment: estree.Comment, line: number) {
  const output = <CommentLineDesc>{};
  output.index = line;
  output.text = code.lines[line - 1];

  // Parse the leading whitespace. For a single line comment, or the first line of a block comment,
  // this is all whitespace leading up to the first slash. For other lines of a block comment, this
  // is all whitespace leading up to the first non-whitespace character.
  const textTrimmedStart = output.text.trimStart();
  output.lead_whitespace = output.text.slice(0, output.text.length - textTrimmedStart.length);

  // Set the opening and closing text
  if (comment.type === 'Block') {
    if (line === comment.loc.start.line && line === comment.loc.end.line) {
      output.open = '/*';
      output.close = '*/';
    } else if (line === comment.loc.start.line) {
      output.open = '/*';
      output.close = '';
    } else if (line === comment.loc.end.line) {
      output.open = '';
      output.close = '*/';
    } else {
      output.open = '';
      output.close = '';
    }
  } else if (comment.type === 'Line') {
    output.open = '//';
    output.close = '';
  }

  // Parse the prefix. For line comments this includes the two forward slashes and any whitespace
  // preceding the content. For the first line of a block comment this includes the forward slash,
  // asterisk(s), and any whitespace preceding the content. For other lines, this includes the
  // leading asterisk if one is present and any whitespace preceding the content.
  if (comment.type === 'Block') {
    if (line === comment.loc.start.line && line === comment.loc.end.line) {
      const haystack = output.text.slice(output.lead_whitespace.length + output.open.length,
        comment.loc.end.column - output.close.length);
      const matches = /^\**\s*/.exec(haystack);
      output.prefix = matches ? matches[0] : '';
    } else if (line === comment.loc.start.line) {
      const haystack = output.text.slice(output.lead_whitespace.length + output.open.length);
      const matches = /^\*+\s*/.exec(haystack);
      output.prefix = matches ? matches[0] : '';
    } else if (line === comment.loc.end.line) {
      const haystack = output.text.slice(output.lead_whitespace.length,
        comment.loc.end.column - output.close.length);
      const matches = /^\*\s+/.exec(haystack);
      output.prefix = matches ? matches[0] : '';
    } else {
      const matches = /^\*\s+/.exec(textTrimmedStart);
      output.prefix = matches ? matches[0] : '';
    }
  } else if (comment.type === 'Line') {
    const text = output.text.slice(comment.loc.start.column + output.open.length);
    const whitespaceLength = text.length - text.trimStart().length;
    output.prefix = output.text.slice(comment.loc.start.column,
      comment.loc.start.column + output.open.length + whitespaceLength);
  }

  // Parse the content. This is all content following the prefix and preceding the suffix. The
  // content does not include leading or trailing whitespace.
  if (comment.type === 'Block') {
    if (line === comment.loc.start.line && line === comment.loc.end.line) {
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length, comment.loc.end.column - output.close.length).trimEnd();
    } else if (line === comment.loc.start.line) {
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length).trimEnd();
    } else if (line === comment.loc.end.line) {
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length, comment.loc.end.column - output.close.length).trimEnd();
    } else {
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length).trimEnd();
    }
  } else if (comment.type === 'Line') {
    output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
      output.prefix.length).trimEnd();
  }

  // Parse markup such as markdown and jsdoc.
  if (output.content.length) {
    const matches = /^([*-]|\d+\.|@[a-zA-Z]+)(\s+)/.exec(output.content);
    if (matches && matches.length === 3) {
      output.markup = matches[1];
      output.markup_space = matches[2];
    } else {
      output.markup = '';
      output.markup_space = '';
    }
  } else {
    output.markup = '';
    output.markup_space = '';
  }

  // Parse the suffix. For a single line comment this is all trailing whitespace after the last
  // non-whitespace character. For the last line of a block comment this is all whitespace following
  // the content and the comment end syntax. For other lines of a block comment this is all
  // whitespace following the content. The suffix does not include a line break.
  if (comment.type === 'Block') {
    if (line === comment.loc.start.line && line === comment.loc.end.line) {
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length, comment.loc.end.column - output.close.length);
    } else if (line === comment.loc.start.line) {
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length);
    } else if (line === comment.loc.end.line) {
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length, comment.loc.end.column - output.close.length);
    } else {
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length);
    }
  } else {
    output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
      output.prefix.length + output.content.length);
  }

  return output;
}
