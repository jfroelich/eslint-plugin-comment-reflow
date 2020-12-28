import eslint from 'eslint';
import estree from 'estree';
import { CommentLine } from './comment-line';

export function parseLine(code: eslint.SourceCode, comment: estree.Comment, line: number) {
  const output = <CommentLine>{};
  output.index = line;
  output.text = code.lines[line - 1];

  const textTrimmedStart = output.text.trimStart();
  output.lead_whitespace = output.text.slice(0, output.text.length - textTrimmedStart.length);

  // TODO: support triple slashes, treat the 3rd slash a part of the prefix, and upon making this
  // change make sure to fix the typescript <reference> check in line-comment handlers

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

  output.directive = parseDirective(comment, output.prefix, output.content, line);
  output.fixme = parseFixme(output.content);

  return output;
}

function parseDirective(comment: estree.Comment, prefix: string, content: string, line: number) {
  if (content.length === 0) {
    return '';
  }

  if (line === comment.loc.start.line && !prefix.startsWith('*') && content.startsWith('tslint:')) {
    return 'tslint';
  }

  if (line === comment.loc.start.line && content.startsWith('global ')) {
    return 'global';
  }

  if (line === comment.loc.start.line && content.startsWith('globals ')) {
    return 'globals';
  }

  if (line === comment.loc.start.line && content.startsWith('jslint ')) {
    return 'jslint';
  }

  if (line === comment.loc.start.line && content.startsWith('property ')) {
    return 'property';
  }

  if (line === comment.loc.start.line && content.startsWith('eslint ')) {
    return 'eslint';
  }

  if (content.startsWith('jshint ')) {
    return 'jshint';
  }

  if (content.startsWith('istanbul ')) {
    return 'istanbul';
  }

  if (content.startsWith('jscs ')) {
    return 'jscs';
  }

  if (content.startsWith('eslint-env')) {
    return 'eslint-env';
  }

  if (content.startsWith('eslint-disable')) {
    return 'eslint-disable';
  }

  if (content.startsWith('eslint-enable')) {
    return 'eslint-enable';
  }

  if (content.startsWith('eslint-disable-next-line')) {
    return 'eslint-disable-next-line';
  }

  if (content.startsWith('eslint-disable-line')) {
    return 'eslint-disable-line';
  }

  if (content.startsWith('exported')) {
    return 'exported';
  }

  if (content.startsWith('@ts-check')) {
    return '@ts-check';
  }

  if (content.startsWith('@ts-nocheck')) {
    return '@ts-nocheck';
  }

  if (content.startsWith('@ts-ignore')) {
    return '@ts-ignore';
  }

  if (content.startsWith('@ts-expect-error')) {
    return '@ts-expect-error';
  }

  if (comment.type === 'Line' && /^\/\s*<(reference|amd)/.test(content)) {
    return content.slice(1).trimLeft();
  }

  return '';
}

/**
 * @todo regex
 */
function parseFixme(content: string) {
  if (content.startsWith('FIXME: ')) {
    return 'FIXME';
  }

  if (content.startsWith('TODO: ')) {
    return 'TODO';
  }

  if (content.startsWith('BUG: ')) {
    return 'BUG';
  }

  if (content.startsWith('WARN: ')) {
    return 'WARN';
  }

  if (content.startsWith('WARNING: ')) {
    return 'WARNING';
  }

  if (content.startsWith('HACK: ')) {
    return 'HACK';
  }

  // if (/^todo\(?.+\)?\:|warn\:|hack\:/i.test(currentLine.content)) {
  //   return;
  // }

  if (content.startsWith('TODO(')) {
    return 'TODO';
  }

  return '';
}
