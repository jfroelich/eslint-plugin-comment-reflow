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
    Program: function(node: estree.Node) {
      return analyzeProgram(node, context);
    }
  };
}

function analyzeProgram(node: estree.Node, ruleContext: eslint.Rule.RuleContext) {
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
    analyzeGroup(node, ruleContext, lineBreakStyle, group, maxLineLength);
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
function analyzeGroup(node: estree.Node, ruleContext: eslint.Rule.RuleContext,
  lineBreakStyle: string, group: Group, threshold: number) {
  const startingLine = group.lines[0].index;

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

  let previous: CommentLine;
  let inMarkdown = false;
  let inJSDocExample = false;

  for (let i = 0; i < group.lines.length; i++) {
    let exitedMarkdownFence = false;

    const current = parseLine(group, group.lines[i], i);

    if (group.type === 'block') {
      if (inMarkdown) {
        if (i > 0 && current.content.startsWith('```')) {
          inMarkdown = false;
          exitedMarkdownFence = true;
        }
      } else if (inJSDocExample) {
        if (current.content.startsWith('@')) {
          if (!current.content.startsWith('@example')) {
            console.log('exiting jsdoc example');
            inJSDocExample = false;
          }
        } else if (i + 1 === group.lines.length) {
          inJSDocExample = false;
        }
      } else if (i > 0 && current.content.startsWith('```')) {
        inMarkdown = true;
      } else if (i > 0 && current.content.startsWith('@example')) {
        inJSDocExample = true;
      }
    }

    if (!inMarkdown && !exitedMarkdownFence && !inJSDocExample) {
      split(group, current, threshold);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    previous = current;
  }

  console.debug('revision count:', revisionCount);

  if (revisionCount < 1) {
    return;
  }

  let replacementText = '';
  replacementText += group.type === 'block' ? '/*' : '//';
  replacementText += group.lines.join(lineBreakStyle);
  replacementText += group.type === 'block' ? '*/' : '';

  console.debug('replacement text "%s"', replacementText.replace('\n', '\\n'));

  const descriptor = <eslint.Rule.ReportDescriptor>{
    node,
    loc: errorLocation,
    messageId: 'reflow',
    data: {
      line: `${startingLine}`
    },
    fix: function (fixer) {
      return fixer.replaceTextRange(replacementRange, replacementText);
    }
  };

  ruleContext.report(descriptor);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function split(group: Group, current: CommentLine, threshold: number) {
  console.log('checking for split:', current.text);

  // TODO: the comments were helpful, i cannot remember half of what was going on

  if (current.text.length <= threshold) {
    return;
  }

  if (current.lead_whitespace.length >= threshold) {
    return;
  }

  if (endIndexOf(current, 'open') >= threshold) {
    return;
  }

  if (endIndexOf(current, 'prefix') >= threshold) {
    return;
  }

  if (current.index + 1 < group.lines.length && endIndexOf(current, 'content') <= threshold) {
    return;
  }

  if (current.index + 1 === group.lines.length && endIndexOf(current, 'close') <= threshold) {
    return;
  }

  // TODO: i think we need to store revision count in group so we can adjust it here? either that
  // or put it in some kind of shared state.

  /*

  // Handle a peculiar edge case of trailing whitespace. It is possible that the current line's text
  // is visibly under the limit, but the trailing whitespace pushes the end position of the current
  // line's text over the limit. This only applies when the whitespace is not visibly part of the
  // content, meaning that this applies to all situations other than the final line of a block
  // comment because that is the only situation where there is closing syntax.

  if ((current.comment.type === 'Line' || current.index !== current.comment.loc.end.line) &&
    endIndexOf(current, 'content') <= threshold && endIndexOf(current, 'suffix') > threshold) {
    return;
  }

  if (current.directive) {
    return;
  }

  if (current.comment.type === 'Block' && current.prefix.startsWith('*') &&
    current.markup.startsWith('@see')) {
    return;
  }

  const tokens = tokenize(current.content);
  const tokenSplitIndex = findTokenSplit(current, tokens);
  const contentBreakpoint = findContentBreak(current, tokens, tokenSplitIndex);
  const lineBreakpoint = findLineBreak(current, tokenSplitIndex, contentBreakpoint);
  const replacementText = composeReplacementText(current, contentBreakpoint, next);

  // For a split, we always draw squigglies under the entire current line. Even though we might be
  // replacing text in the next line when fixing the issue. I guess location and replacement range
  // are not required to be equal?

  const loc = <eslint.AST.SourceLocation>{
    start: {
      line: current.index,
      column: 0
    },
    end: {
      line: current.index,
      column: endIndexOf(current, 'close')
    }
  };

  const range = createReplacementRange(current, lineBreakpoint, next);

  const report: eslint.Rule.ReportDescriptor = {
    node: current.context.node,
    loc,
    messageId: 'split',
    data: {
      line: `${current.index}`,
      column: `${lineBreakpoint}`
    },
    fix: function (fixer) {
      return fixer.replaceTextRange(range, replacementText);
    }
  };

  return report;
  */
}

export function sniffLineBreakStyle(context: eslint.Rule.RuleContext) {
  // pattern ripped from eslint/shared/ast-utils
  const matches = /\r\n|[\r\n\u2028\u2029]/u.exec(context.getSourceCode().getText());
  return matches ? matches[0] : '\n';
}

export interface CommentLine {
  /**
   * The line number in the group. 0 based.
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
   *
   * For a non-first line block comment line, a prefix without an asterisk will be empty and all
   * space is taken by the lead whitespace.
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
 * @param group the group containing the line being parsed
 * @param groupLine the group line referring to the unparsed line and comment
 * @param index the index of the line in the group's lines
 */
export function parseLine(group: Group, groupLine: GroupLine, index: number) {
  const line = <CommentLine>{};
  line.index = index;
  line.text = groupLine.text;

  if (group.type === 'line') {
    const parts = /^(\s*)(\/\/)(\s*)(.*)/.exec(line.text);
    line.lead_whitespace = parts[1];
    line.open = parts[2];
    line.prefix = parts[3];
    line.content = parts[4].trimEnd();
    line.suffix = parts[4].slice(line.content.length);
    line.close = '';
  } else if (group.type === 'block') {
    if (group.lines.length === 1) {
      const parts = /^(\s*)(\/\*)(\*?\s*)(.*)(\*\/)/.exec(line.text);
      line.lead_whitespace = parts[1];
      line.open = parts[2];
      line.prefix = parts[3];
      line.content = parts[4].trimEnd();
      line.suffix = parts[4].slice(line.content.length);
      line.close = parts[5];
    } else if (index === 0) {
      const parts = /^(\s*)(\/\*)(\*?\s*)(.*)/.exec(line.text);
      line.lead_whitespace = parts[1];
      line.open = parts[2];
      line.prefix = parts[3];
      line.content = parts[4].trimEnd();
      line.suffix = parts[4].slice(line.content.length);
      line.close = '';
    } else if (index === group.lines.length - 1) {
      const parts = /^(\s*)(\*?\s*)(.*)(\*\/)/.exec(line.text);
      line.lead_whitespace = parts[1];
      line.open = '';
      line.prefix = parts[2];
      line.content = parts[3].trimEnd();
      line.suffix = parts[3].slice(line.content.length);
      line.close = parts[4];
    } else {
      const parts = /^(\s*)(\*?\s*)(.*)/.exec(line.text);
      line.lead_whitespace = parts[1];
      line.open = '';
      line.prefix = parts[2];
      line.content = parts[3].trimEnd();
      line.suffix = parts[3].slice(line.content.length);
      line.close = '';
    }
  }

  if (group.type === 'block') {
    const [markup, markupSpace] = parseMarkup(line);
    line.markup = markup;
    line.markup_space = markupSpace;
  }

  line.directive = parseDirective(group, line);

  const fixmes = /^(fix|fixme|todo|note|bug|warn|warning|hack|todo\([^)]*\))(:)/is.exec(
    line.content
  );
  if (fixmes) {
    line.fixme = fixmes[1];
  }

  return line;
}

function parseMarkup(line: CommentLine) {
  if (!line.prefix.startsWith('*')) {
    return ['', ''];
  }

  if (!line.content.length) {
    return ['', ''];
  }

  const jsdocMatches = /^(@[a-zA-Z]+)(\s*)/.exec(line.content);
  if (jsdocMatches) {
    return [jsdocMatches[1], jsdocMatches[2] ? jsdocMatches[2] : ''];
  }

  const listMatches = /^([*-]|\d+\.|#{1,6})(\s+)/.exec(line.content);
  if (listMatches) {
    return [listMatches[1], listMatches[2]];
  }

  if (/^\|.+\|$/.test(line.content)) {
    return [line.content, ''];
  }

  return ['', ''];
}

export function parseDirective(group: Group, line: CommentLine) {
  if (line.index === 0) {
    const matches = /^(globals?\s|jslint\s|tslint:\s|property\s|eslint\s|jshint\s|istanbul\s|jscs\s|eslint-env|eslint-disable|eslint-enable|eslint-disable-next-line|eslint-disable-line|exported|@ts-check|@ts-nocheck|@ts-ignore|@ts-expect-error)/.exec(line.content);
    if (matches) {
      return matches[1].trimEnd();
    }
  }

  if (group.type === 'line' && /^\/\s*<(reference|amd)/.test(line.content)) {
    return line.content.slice(1).trimLeft();
  }

  return '';
}

export function tokenize(string: string) {
  const matches = string.matchAll(/[^\s-]+|(?:\s+|-)/g);
  const tokens: string[] = [];

  for (const match of matches) {
    tokens.push(match[0]);
  }

  return tokens;
}

export function isLeadWhitespaceAligned(group: Group, current: CommentLine, next?: CommentLine) {
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

  if (group.type === 'block') {
    if (current.prefix.startsWith('*')) {
      if (current.index === 0) {
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

export function containsMarkdownList(group: Group, line: CommentLine) {
  return group.type === 'block' && (line.markup.startsWith('*') || line.markup.startsWith('-') ||
    /^\d/.test(line.markup));
}

export function containsJSDocTag(group: Group, line: CommentLine) {
  return group.type === 'block' && line.markup.startsWith('@');
}
