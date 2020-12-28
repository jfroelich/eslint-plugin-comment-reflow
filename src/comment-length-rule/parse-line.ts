import eslint from 'eslint';
import estree from 'estree';
import { CommentLine } from './comment-line';

export function parseLine(code: eslint.SourceCode, comment: estree.Comment, line: number) {
  const output = <CommentLine>{};
  output.index = line;
  output.text = code.lines[line - 1];

  const textTrimmedStart = output.text.trimStart();
  output.lead_whitespace = output.text.slice(0, output.text.length - textTrimmedStart.length);

  if (comment.type === 'Line') {
    output.open = '//';
    output.close = '';
    const afterOpen = output.text.slice(output.lead_whitespace.length + output.open.length);
    const afterOpenTrimStart = afterOpen.trimStart();
    const afterOpenSpaceLen = afterOpen.length - afterOpenTrimStart.length;
    output.prefix = output.text.slice(output.lead_whitespace.length + output.open.length,
      output.lead_whitespace.length + output.open.length + afterOpenSpaceLen);
    output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
      output.prefix.length).trimEnd();
    output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
      output.prefix.length + output.content.length);
  } else if (comment.type === 'Block') {
    if (line === comment.loc.start.line && line === comment.loc.end.line) {
      output.open = '/*';
      output.close = '*/';
      const prefixHaystack = output.text.slice(output.lead_whitespace.length + output.open.length,
        comment.loc.end.column - output.close.length);
      const prefixMatch = /^\**\s*/.exec(prefixHaystack);
      output.prefix = prefixMatch ? prefixMatch[0] : '';
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length, comment.loc.end.column - output.close.length).trimEnd();
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length, comment.loc.end.column - output.close.length);
    } else if (line === comment.loc.start.line) {
      output.open = '/*';
      output.close = '';
      const prefixHaystack = output.text.slice(output.lead_whitespace.length + output.open.length);
      const prefixMatch = /^\*+\s*/.exec(prefixHaystack);
      output.prefix = prefixMatch ? prefixMatch[0] : '';
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length).trimEnd();
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length);
    } else if (line === comment.loc.end.line) {
      output.open = '';
      output.close = '*/';
      const prefixHaystack = output.text.slice(output.lead_whitespace.length,
        comment.loc.end.column - output.close.length);
      const prefixMatch = /^\*\s+/.exec(prefixHaystack);
      output.prefix = prefixMatch ? prefixMatch[0] : '';
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length, comment.loc.end.column - output.close.length).trimEnd();
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length, comment.loc.end.column - output.close.length);
    } else {
      output.open = '';
      output.close = '';
      const prefixMatch = /^\*\s+/.exec(textTrimmedStart);
      output.prefix = prefixMatch ? prefixMatch[0] : '';
      output.content = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length).trimEnd();
      output.suffix = output.text.slice(output.lead_whitespace.length + output.open.length +
        output.prefix.length + output.content.length);
    }
  } else {
    // eslint for some reason if forgetting about its own shebang type in the AST
    throw new TypeError(`Unexpected comment type "${<string>comment.type}"`);
  }

  // Re-parse the content for markup such as markdown and jsdoc.

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

  return output;
}
