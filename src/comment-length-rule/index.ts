import assert from 'assert';
import eslint from 'eslint';
import estree from 'estree';

export default <eslint.Rule.RuleModule>{
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      reflow: 'Comment(s) starting on {{line}} needs reflow.'
    }
  },
  create: createCommentLengthRule
};

function createCommentLengthRule(context: eslint.Rule.RuleContext) {
  return {
    Program: function(/*node: estree.Node*/) {
      return analyzeProgram(context/*, node*/);
    }
  };
}

function analyzeProgram(ruleContext: eslint.Rule.RuleContext/*, node: estree.Node*/) {
  let maxLineLength = 80;
  if (ruleContext.options && ruleContext.options.length) {
    maxLineLength = <number>ruleContext.options[0];
  }

  assert(Number.isInteger(maxLineLength), 'Invalid option for maximum line length');

  const code = ruleContext.getSourceCode();
  const comments = code.getAllComments();
  const candidates = comments.filter(isAnalyzableComment, ruleContext);
  const groups = groupComments(ruleContext, candidates);
  const lineBreakStyle = sniffLineBreakStyle(ruleContext);

  for (const group of groups) {
    analyzeGroup(ruleContext, lineBreakStyle, group);
  }
}

function isAnalyzableComment(this: eslint.Rule.RuleContext, comment: estree.Comment) {
  if (comment.type !== 'Block' && comment.type !== 'Line') {
    return false;
  }

  const code = this.getSourceCode();
  const token = code.getTokenBefore(comment, { includeComments: true });
  if (token && token.loc.end.line === comment.loc.start.line) {
    return false;
  }

  if (comment.type === 'Block') {
    const token = code.getTokenAfter(comment, { includeComments: true });
    if (token && comment.loc.end.line === token.loc.start.line) {
      return false;
    }
  }

  return true;
}

interface Group {
  type: 'block' | 'line';
  lines: GroupLine[];
}

interface GroupLine {
  comment: estree.Comment;
  index: number;
  text: string;
}

function groupComments(context: eslint.Rule.RuleContext, comments: estree.Comment[]) {
  const code = context.getSourceCode();
  const groups: Group[] = [];
  let buffer: GroupLine[] = [];

  for (const comment of comments) {
    if (comment.type === 'Block') {
      if (buffer.length) {
        groups.push({ type: 'line', lines: buffer });
        buffer = [];
      }

      for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
        buffer.push({ comment, index: line, text:  code.lines[line - 1]});
      }

      groups.push({ type: 'block', lines: buffer });
      buffer = [];
    } else if (comment.type === 'Line') {
      const line = comment.loc.start.line;
      if (buffer.length === 0 || buffer[buffer.length - 1].index + 1 === line) {
        buffer.push({ comment, index: line, text:  code.lines[line - 1]});
      } else {
        groups.push({ type: 'line', lines: buffer });
        buffer = [{ comment, index: line, text:  code.lines[line - 1]}];
      }
    }
  }

  if (buffer.length) {
    groups.push({ type: 'line', lines: buffer });
  }

  return groups;
}

/**
 * Analyze a comment group to determine whether a linting error should be reported along with a fix
 * that will rewrite the comment group such that it no longer violates the rule. While a comment
 * group might contain multiple linting errors, we only create one report for the whole group. This
 * avoids issues with generating overlapping errors per comment.
 *
 * We want to use an online algorithm. This means we do not want a bunch of greedy loops and parsing
 * and "look ahead". We want this this to work as if it was processing an input stream of file lines
 * and only was aware of a recently observed lines and the last line of a group where it was decided
 * a group terminated.
 *
 * We want to defer parsing until it is actually needed. While it would be trivial to simply parse
 * each line, make a change, then re-parse all the lines again, make another change, and so on, that
 * is a lot of redundant parsing. Parsing is expensive. So, while we allowed the buffer of lines in
 * the group to accumulate, we want a second online algorithm that iterates over the lines, seeing
 * only the previous line.
 *
 * Unlike before, we do not generate a report each time we reach a decision to split a line or merge
 * two lines. Instead, we simply keep track of a count of the number of revisions made to a comment
 * group. At the end, if the revision counter is not 0, that means there is an error. Each time we
 * make a revision, we revise the group. We introduce new lines when splitting. We remove lines when
 * merging. So the line group is mutated as the algorith progresses through the lines. The entire
 * comment line group is replaced as a result of the fix. The replacement text is the modified
 * line text of each line in the group.
 *
 * There are a couple ways the algorithm could work. I think initially the approach is as follows.
 * Iterate over the lines of the group. For a line, check if it should be split. If it should be
 * split, split it. Increment the revision count. Advance to the next line. If it should not be
 * split, check if it should be merged. If it should be merged, merge it. Reparse the lines? Then
 * reprocess the next line because it may need to be split. If it does not need to be merged, then
 * advance to the next line. When finished iterating over the lines, check the revision count. If it
 * is more than 0, report an error and its fix.
 */
function analyzeGroup(ruleContext: eslint.Rule.RuleContext, _lineBreakStyle: string, group: Group) {
  const revisionCount = 0;

  // Compute the error location. This is what get highlighted in the editor. We highlight the entire
  // comment. We do this before mutation since the lines may change. We are excluding the leading
  // text on the line preceding the group and the trailing text on the line following the group.

  const errorLocation = <eslint.AST.SourceLocation>{
    start: {
      line: group.lines[0].index,
      column: group.lines[0].comment.loc.start.column
    },
    end: {
      line: group.lines[group.lines.length - 1].index,
      column: group.lines[group.lines.length - 1].comment.loc.end.column
    }
  };

  // Compute the replacement text range when applying a fix. We will be replacing the entire group,
  // including the syntax. This may be trivially derived from the report location, but for now, it
  // is computed separately. This could be deferred until later but for now it is precomputed. Keep
  // in mind that unlike before, we are counting the open and close syntax of the comment.

  const replacementRange = <eslint.AST.Range>[
    ruleContext.getSourceCode().getIndexFromLoc(errorLocation.start),
    ruleContext.getSourceCode().getIndexFromLoc(errorLocation.end)
  ];

  // TODO: this is undergoing revision

  let groupLineIndex = 0;
  while (true) {
    const groupLine = group.lines[groupLineIndex];
    const lineDesc = parseLine(group, groupLine, groupLineIndex);
    console.log(lineDesc);

    groupLineIndex++;
    if (groupLineIndex === group.lines.length) {
      break;
    }
  }

  if (revisionCount < 1) {
    return;
  }

  // TEMP: just marking the variable "in use"
  console.log('replacement range:', replacementRange);

  const descriptor = <eslint.Rule.ReportDescriptor>{
    loc: errorLocation
  };

  ruleContext.report(descriptor);
}

export function sniffLineBreakStyle(context: eslint.Rule.RuleContext) {
  // pattern ripped from eslint/shared/ast-utils
  const matches = /\r\n|[\r\n\u2028\u2029]/u.exec(context.getSourceCode().getText());
  return matches ? matches[0] : '\n';
}

export interface CommentLine {
  /**
   * Reference to comment that contains the line.
   *
   * @see https://eslint.org/docs/developer-guide/working-with-custom-parsers#all-nodes
   */
  comment: estree.Comment;

  /**
   * The ESLint line index, which is 1-based. This should not be confused with some kind of index
   * into an array of lines for a comment. This is the global index for the entire file.
   */
  index: number;

  /**
   * Whitespace characters leading up to the open region. For a block comment, it is assumed that
   * block comments that follow another kind of token on the same line are never analyzed, so this
   * means that this is whitespace starting from the first character in the line.
   */
  lead_whitespace: string;

  /**
   * The syntactical characters that start the comment. For block comments this is only set on the
   * first line and for all other lines is an empty string. This does not include the whitespace
   * preceding or following the characters. For javadoc-formatted block comments this does not
   * include the second asterisk. For triple slash line comments, this does not include the third
   * slash.
   */
  open: string;

  /**
   * The characters that end the comment. For block comments this is set on the last line. In all
   * other situations this is an empty string. This does not include the whitespace preceding or
   * following the star slash.
   */
  close: string;

  /**
   * The full text of a line containing a comment. The text does not include line break characters
   * because of how ESLint parses the lines. The text may include characters that are not a part of
   * the comment because the value is derived from a value in ESLint's line array which is computed
   * separately from its comments array. The text includes the comment syntax like the forward
   * slashes. Because it is assumed that block comments that follow another kind of token on the
   * same line are not analyzed, the text starts from the first character on the line.
   */
  text: string;

  /**
   * The characters between the comment open and the start of the content. For example, for a single
   * line comment, this is the whitespace following the slashes and before the text. For a javadoc
   * formatted comment line in the middle of the comment, this might include a leading asterisk
   * followed by some whitespace. For the first line of a javadoc comment, this will include the
   * second asterisk as its first character.
   */
  prefix: string;

  /**
   * The text of the comment line between its prefix and suffix.
   */
  content: string;

  /**
   * Represents the occassional initial markup that appears at the start of the line's content such
   * as a jsdoc tag or some markdown. Markup does not precede the content like the prefix; it
   * overlaps.
   */
  markup: string;

  /**
   * Represents the whitespace immediately following the markup token up to the first non-space
   * character (exclusive). Overlaps with content.
   */
  markup_space: string;

  /**
   * Represents a directive such tslint or globals or @ts-ignore. This does not include the trailing
   * space or the trailing text after the directive.
   */
  directive: string;

  /**
   * Contains the start of some FIXME text if the comment content contains some.
   *
   * @example
   *   // TODO(jfroelich): Add support for fixme to this project!
   *   // BUG: Only supporting uppercase is a feature.
   */
  fixme: string;

  /** Whitespace that follows the content and precedes the close. */
  suffix: string;
}

type Region = keyof Pick<CommentLine,
  'lead_whitespace' | 'open' | 'close' | 'prefix' | 'content' | 'suffix' | 'close'>;

/**
 * Returns the length of the text in the given line up to the end of the given region.
 */
export function endIndexOf(line: CommentLine, region: Region) {
  switch (region) {
  case 'lead_whitespace': {
    return line.lead_whitespace.length;
  }

  case 'open': {
    return line.lead_whitespace.length + line.open.length;
  }

  case 'prefix': {
    return line.lead_whitespace.length + line.open.length + line.prefix.length;
  }

  case 'content': {
    return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length;
  }

  case 'suffix': {
    return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + line.suffix.length;
  }

  case 'close': {
    return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + line.suffix.length + line.close.length;
  }

  default: {
    throw new Error(`Unknown/unsupported region "${<string>region}"`);
  }
  }
}

/**
 * @todo cannot use original eslint comment location values any more since we are mutating the text
 * during analysis and re-analyzing mutated text. so we need to figure this stuff out dynamically
 * repeatedly, this is the next todo. also, do not forget the helpers to this function.
 */
export function parseLine(group: Group, groupLine: GroupLine, groupLineIndex: number) {
  const line = <CommentLine>{};
  line.comment = groupLine.comment;
  line.text = groupLine.text;

  const textTrimmedStart = line.text.trimStart();
  line.lead_whitespace = line.text.slice(0, line.text.length - textTrimmedStart.length);

  if (group.type === 'line') {
    line.open = '//';
    line.close = '';

    // TODO: support triple slashes, treat the 3rd slash a part of the prefix, and upon making this
    // change make sure to fix the typescript <reference> check in line-comment handlers

    const afterOpen = line.text.slice(line.lead_whitespace.length + line.open.length);
    const afterOpenTrimStart = afterOpen.trimStart();
    const afterOpenSpaceLen = afterOpen.length - afterOpenTrimStart.length;
    line.prefix = line.text.slice(line.lead_whitespace.length + line.open.length,
      line.lead_whitespace.length + line.open.length + afterOpenSpaceLen);
    line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
      line.prefix.length).trimEnd();
    line.suffix = line.text.slice(line.lead_whitespace.length + line.open.length +
      line.prefix.length + line.content.length);
  } else if (group.type === 'block') {
    if (group.lines.length === 1) {
      line.open = '/*';
      line.close = '*/';
      const prefixHaystack = line.text.slice(line.lead_whitespace.length + line.open.length,
        groupLine.comment.loc.end.column - line.close.length);
      const prefixMatch = /^\**\s*/.exec(prefixHaystack);
      line.prefix = prefixMatch ? prefixMatch[0] : '';
      line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length, groupLine.comment.loc.end.column - line.close.length).trimEnd();
      line.suffix = line.text.slice(
        line.lead_whitespace.length + line.open.length + line.prefix.length + line.content.length,
        groupLine.comment.loc.end.column - line.close.length
      );
    } else if (groupLineIndex === 0) {
      line.open = '/*';
      line.close = '';
      const prefixHaystack = line.text.slice(line.lead_whitespace.length + line.open.length);
      const prefixMatch = /^\*+\s*/.exec(prefixHaystack);
      line.prefix = prefixMatch ? prefixMatch[0] : '';
      line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length).trimEnd();
      line.suffix = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length + line.content.length);
    } else if (groupLineIndex === group.lines.length - 1) {
      line.open = '';
      line.close = '*/';
      const prefixHaystack = line.text.slice(line.lead_whitespace.length,
        groupLine.comment.loc.end.column - line.close.length);
      const prefixMatch = /^\*\s+/.exec(prefixHaystack);
      line.prefix = prefixMatch ? prefixMatch[0] : '';
      line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length, groupLine.comment.loc.end.column - line.close.length).trimEnd();
      line.suffix = line.text.slice(
        line.lead_whitespace.length + line.open.length + line.prefix.length + line.content.length,
        groupLine.comment.loc.end.column - line.close.length
      );
    } else {
      line.open = '';
      line.close = '';
      const prefixMatch = /^\*\s+/.exec(textTrimmedStart);
      line.prefix = prefixMatch ? prefixMatch[0] : '';
      line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length).trimEnd();
      line.suffix = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length + line.content.length);
    }
  }

  const [markup, markupSpace] = parseMarkup(line);
  line.markup = markup;
  line.markup_space = markupSpace;

  line.directive = parseDirective(line);
  line.fixme = parseFixme(line.content);

  return line;
}

/**
 * Parses the content for markup. Returns an array where the first element is some of the markup
 * and the second is trailing whitespace if any. This focuses on markdown but it can also match
 * jsdoc.
 *
 * @todo consider creating a jsdoc prop and a markdown prop and not mixing the two.
 */
function parseMarkup(line: CommentLine) {
  // Only recognize markup in block comments.
  if (line.comment.type !== 'Block') {
    return ['', ''];
  }

  // Only recognize markup in javadoc comments
  if (!line.prefix.startsWith('*')) {
    return ['', ''];
  }

  if (!line.content.length) {
    return ['', ''];
  }

  // For jsdoc tags, we cannot require a trailing space, so for simplicitly this is a separate
  // regex test than the markdown pattern. Might combine in the future for perf.

  const jsdocMatches = /^(@[a-zA-Z]+)(\s*)/.exec(line.content);
  if (jsdocMatches && jsdocMatches.length) {
    return [jsdocMatches[1], jsdocMatches[2] ? jsdocMatches[2] : ''];
  }

  // TODO: markdown horizontal rules
  // TODO: indented lists (we might already support this because whitespace in prefix)

  const matches = /^([*-]|\d+\.|#{1,6})(\s+)/.exec(line.content);
  if (matches && matches.length === 3) {
    return [matches[1], matches[2]];
  }

  // markdown table parsing, this probably could be written better
  // TODO: support trailing space

  if (/^\|.+\|$/.test(line.content)) {
    return [line.content, ''];
  }

  return ['', ''];
}

function parseDirective(line: CommentLine) {
  if (line.content.length === 0) {
    return '';
  }

  if (line.index === line.comment.loc.start.line && !line.prefix.startsWith('*') &&
    line.content.startsWith('tslint:')) {
    return 'tslint';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('global ')) {
    return 'global';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('globals ')) {
    return 'globals';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('jslint ')) {
    return 'jslint';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('property ')) {
    return 'property';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('eslint ')) {
    return 'eslint';
  }

  if (line.content.startsWith('jshint ')) {
    return 'jshint';
  }

  if (line.content.startsWith('istanbul ')) {
    return 'istanbul';
  }

  if (line.content.startsWith('jscs ')) {
    return 'jscs';
  }

  if (line.content.startsWith('eslint-env')) {
    return 'eslint-env';
  }

  if (line.content.startsWith('eslint-disable')) {
    return 'eslint-disable';
  }

  if (line.content.startsWith('eslint-enable')) {
    return 'eslint-enable';
  }

  if (line.content.startsWith('eslint-disable-next-line')) {
    return 'eslint-disable-next-line';
  }

  if (line.content.startsWith('eslint-disable-line')) {
    return 'eslint-disable-line';
  }

  if (line.content.startsWith('exported')) {
    return 'exported';
  }

  if (line.content.startsWith('@ts-check')) {
    return '@ts-check';
  }

  if (line.content.startsWith('@ts-nocheck')) {
    return '@ts-nocheck';
  }

  if (line.content.startsWith('@ts-ignore')) {
    return '@ts-ignore';
  }

  if (line.content.startsWith('@ts-expect-error')) {
    return '@ts-expect-error';
  }

  if (line.comment.type === 'Line' && /^\/\s*<(reference|amd)/.test(line.content)) {
    return line.content.slice(1).trimLeft();
  }

  return '';
}

/**
 * @todo regex
 * @todo do we indent the text on overflow? if so we need to figure out the indent level.
 */
function parseFixme(content: string) {
  if (content.startsWith('FIXME: ')) {
    return 'FIXME';
  }

  if (content.startsWith('TODO: ')) {
    return 'TODO';
  }

  if (content.startsWith('NOTE: ')) {
    return 'NOTE';
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

/**
 * Split a string into an array of word, hyphen, and space tokens.
 */
export function tokenize(string: string) {
  const matches = string.matchAll(/[^\s-]+|(?:\s+|-)/g);
  const tokens: string[] = [];

  for (const match of matches) {
    tokens.push(match[0]);
  }

  return tokens;
}

export function isLeadWhitespaceAligned(current: CommentLine, next?: CommentLine) {
  // When there is no next line, there is no misalignment concern, so report aligned.
  if (!next) {
    return true;
  }

  // If the line's prefix starts with an asterisk then assume it is javadoc. For the first line of a
  // javadoc comment, the lines are only aligned if the asterisks are vertically aligned. The first
  // asterisk of the second line should be underneath the second asterisk of the first line. This
  // means there should be one extra space in the second line. for other lines of a javadoc comment,
  // fall through to requiring exact equality. In the non-javadoc case, everything is always aligned
  // because lead whitespace is a part of the content and not treated as lead whitespace.

  if (current.comment.type === 'Block') {
    if (current.prefix.startsWith('*')) {
      if (current.index === current.comment.loc.start.line) {
        return next.lead_whitespace.length - current.lead_whitespace.length === 1;
      } else {
        // FALL THROUGH
      }
    } else {
      return true;
    }
  }

  return current.lead_whitespace.length === next.lead_whitespace.length;
}

export function containsMarkdownList(line: CommentLine) {
  return line.comment.type === 'Block' && (line.markup.startsWith('*') ||
    line.markup.startsWith('-') || /^\d/.test(line.markup));
}

export function containsJSDocTag(line: CommentLine) {
  return line.comment.type === 'Block' && line.markup.startsWith('@');
}
