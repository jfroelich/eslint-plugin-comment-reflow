import eslint from 'eslint';
import estree from 'estree';

interface ScanState {
  max_line_length: number;
  line_break_chars: string;
  program: estree.Program;
  context: eslint.Rule.RuleContext;
}

type BufferType = 'block' | 'line';

export default <eslint.Rule.RuleModule>{
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      reflow: 'Comment starting on line {{line}} needs reflow.'
    }
  },
  create: function (context: eslint.Rule.RuleContext) {
    const state = <ScanState>{};
    state.context = context;
    state.max_line_length = context.options?.length && Number.isInteger(context.options[0]) ?
      <number>context.options[0] : 80;
    state.line_break_chars = findLineBreakChars(context);

    return <eslint.Rule.RuleListener>{
      Program: program => {
        state.program = program;
        scan(state);
      }
    };
  }
};

/**
 * Scan the comments with a windowed buffer. Process each buffer as it ends. A buffer contains
 * either one block comment or one or more contiguous line comments.
 */
function scan(state: ScanState) {
  const code = state.context.getSourceCode();
  const comments: estree.Comment[] = code.getAllComments();
  let buffer: estree.Comment[] = [];

  for (const comment of comments) {
    if (comment.type === 'Block') {
      handleBufferEnd(buffer, state);
      buffer = [];

      const before = code.getTokenBefore(comment, { includeComments: true });
      const after = code.getTokenAfter(comment, { includeComments: true });
      if ((!before || before.loc.end.line < comment.loc.start.line) &&
        (!after || after.loc.start.line > comment.loc.end.line)) {
        buffer.push(comment);
      }
    } else if (comment.type === 'Line') {
      const before = code.getTokenBefore(comment, { includeComments: true });
      if (before?.loc.end.line === comment.loc.start.line) {
        handleBufferEnd(buffer, state);
        buffer = [];
      } else if (buffer.length && buffer[buffer.length - 1].type === 'Line' &&
        buffer[buffer.length - 1].loc.start.line === comment.loc.start.line - 1) {
        buffer.push(comment);
      } else {
        handleBufferEnd(buffer, state);
        buffer = [];
        buffer.push(comment);
      }
    } else {
      // treat shebangs as buffer breaks
      handleBufferEnd(buffer, state);
      buffer = [];
    }
  }

  // Flush the last buffer.
  handleBufferEnd(buffer, state);
}

/**
 * Analyze the lines of the buffer and check for lines that should be split or merged. Generate an 
 * eslint report with a fix if any lines should change. We generate one report per group of comments
 * because of eslint's issues with sequential fixes.
 */
function handleBufferEnd(buffer: estree.Comment[], scanState: ScanState) {
  if (buffer.length === 0) {
    return;
  }

  // Copy the lines into descs as line descriptors so that we can freely mutate the descs without 
  // mutating the comment objects.

  const descs: LineDesc[] = [];
  for (let line = buffer[0].loc.start.line; line <= buffer[buffer.length - 1].loc.end.line;
    line++) {
    const desc = <LineDesc>{};
    desc.scan_state = scanState;
    desc.type = buffer[0].type === 'Block' ? 'block' : 'line';
    desc.text = scanState.context.getSourceCode().lines[line - 1];
    desc.index = line - buffer[0].loc.start.line;
    desc.parsed = false;
    descs.push(desc);
  }

  // Transform the descs array by splitting and merging descs.

  for (let i = 0; i < descs.length; i++) {
    parseLineDesc(descs[i], descs.length);
    if (shouldSplit(descs[i], descs.length)) {
      const newDescs = splitDesc(descs[i], descs.length);
      // Replace the current descriptor with the two new descriptors.
      descs.splice(descs[i].index, 1, ...newDescs);

      // shift the remaining indexes by 1.
      for (let j = descs[i].index + 2; j < descs.length; j++) {
        descs[j].index++;
      }

      // since we mutated via insertion, we want to immediately begin processing the new line and 
      // not also check for merging. we want to check if we should split the new line again, and 
      // then check for merging.
      continue;
    }

    // TODO: check for merge of current line into previous, if not first line.

    if (shouldMerge(descs[i], descs)) {

    }
  }

  for (const desc of descs) {
    console.log('post transform:', desc.index, desc.text);
  }

  // TODO: if the count of desc lines does not correspond to the count input buffer lines, then we
  // know some mutation occurred and so we should indicate a correction. Create a report with a fix
  // where we replace the entire comment. We use the boundaries of the original comment and then
  // specify replacement text by building it from the line descs.
}

function shouldMerge(current: LineDesc, descs: LineDesc[]) {
  // If the line index is 0, then there is no previous line to merge into, so do not merge.
  if (current.index === 0) {
    return false;
  }

  // We may be dealing with an inserted line from a split that was not yet reparsed.
  if (!current.parsed) {
    parseLineDesc(current, descs.length);
  }

  // We could be looking at a comment line that is empty. Preserve empty lines.
  if (!current.content) {
    return false;
  }

  const previous = descs[current.index - 1];

  // The previous line may not have been parsed yet.
  if (!previous.parsed) {
    parseLineDesc(previous, descs.length);
  }

  // The previous line may not have any content. Preserve empty lines.
  if (!previous.content) {
    return false;
  }

  // We should not merge with the previous line when either line contains a directive.
  if (previous.directive || current.directive) {
    return false;
  }

  // We should not merge with the previous line if the current line contains a fixme.
  if (current.fixme) {
    return false;
  }

  // Only merge if the two lines have similar leading whitespace, if applicable.
  if (!isLeadWhitespaceAligned(previous, current)) {
    return false;
  }

  // Do not merge if the lines have different prefixes, unless the previous line contains markup.
  if (previous.lead_whitespace.length === current.lead_whitespace.length &&
    previous.prefix.length !== current.prefix.length) {
    if (previous.markup) {
      // allow merge even though indentation because previous line is markup.
      // for example, this might the second line of a bullet point with extra
      // leading whitespace but if the first line of the bullet point is short
      // we still want to merge.
    } else {
      // the two lines have different content indentation, assume this is not
      // author laziness and do not merge.
      return false;
    }
  }

  // If the previous line is at or over the limit, then do not merge. There is no space available to
  // shift content from the current line into the previous.

  if (previous.lead_whitespace.length + previous.open.length + previous.prefix.length + 
    previous.content.length + previous.suffix.length + previous.close.length >= 
    previous.scan_state.max_line_length) {
    return false;
  }

  if (containsMarkdownList(current)) {
    return false;
  }

  if (containsJSDocTag(current)) {
    return;
  }

  // TODO: tokenize. But we have a problem now. We do not want to retokenize when performing the 
  // merge. I guess we cache the tokens in the line desc?

/*

  const tokens = tokenize(current.content);

  const isHyphenMerge = (tokens[0] === '-' && !previous.content.endsWith('-')) ||
    (tokens[0] !== '-' && previous.content.endsWith('-'));

  let spaceRemaining = previous.context.max_line_length - previousLineEndPosition;

  if (!isHyphenMerge) {
    spaceRemaining--;
  }

  const fittingTokens = [];
  for (const token of tokens) {
    if (token.length <= spaceRemaining) {
      fittingTokens.push(token);
      spaceRemaining -= token.length;
    } else {
      break;
    }
  }

  if (fittingTokens.length === 0) {
    return;
  }
*/

  return true;
}

function containsMarkdownList(line: LineDesc) {
  return line.type === 'block' && (line.markup?.startsWith('*') || line.markup?.startsWith('-') ||
    /^\d/.test(line.markup));
}

export function containsJSDocTag(line: LineDesc) {
  return line.type === 'block' && line.markup.startsWith('@');
}


function isLeadWhitespaceAligned(line1: LineDesc, line2: LineDesc) {
  // If the line's prefix starts with an asterisk then assume it is javadoc. For the first line of a
  // javadoc comment, the lines are only aligned if the asterisks are vertically aligned. The first
  // asterisk of the second line should be underneath the second asterisk of the first line. This
  // means there should be one extra space in the second line. for other lines of a javadoc comment,
  // fall through to requiring exact equality. In the non-javadoc case, everything is always aligned
  // because lead whitespace is a part of the content and not treated as lead whitespace.

  if (line1.type === 'block') {
    if (line2.prefix.startsWith('*')) {
      if (line2.index === 0) {
        return line2.lead_whitespace.length - line1.lead_whitespace.length === 1;
      } else {
        // FALL THROUGH
      }
    } else {
      return true;
    }
  }

  return line2.lead_whitespace.length === line2.lead_whitespace.length;
}

function splitDesc(desc: LineDesc, lineCount: number) {
  const tokens = tokenize(desc.content);
  const tokenSplitIndex = findTokenSplit(desc, tokens, lineCount);

  let breakpoint = -1;
  if (desc.type === 'block' && desc.index + 1 === lineCount && 
    desc.lead_whitespace.length + desc.open.length + desc.prefix.length + desc.content.length <= 
    desc.scan_state.max_line_length) {
    breakpoint = -1;
  } else if (tokenSplitIndex === -1) {
    breakpoint = desc.scan_state.max_line_length - (desc.lead_whitespace.length + 
      desc.open.length + desc.prefix.length);
  } else if (tokens[tokenSplitIndex].trim().length === 0) {
    breakpoint = tokens.slice(0, tokenSplitIndex + 1).join('').length;
  } else {
    breakpoint = tokens.slice(0, tokenSplitIndex).join('').length;
  }

  const desc1 = <LineDesc>{};
  desc1.index = desc.index;
  desc1.scan_state = desc.scan_state;
  desc1.text = desc.lead_whitespace + desc.open + desc.prefix + desc.content.slice(0, breakpoint);
  desc1.type = desc.type;
  desc1.parsed = false;

  const desc2 = <LineDesc>{};
  desc2.index = desc.index + 1;
  desc2.scan_state = desc.scan_state;
  const open = desc.type === 'block' && desc.index === 0 ? '' : desc.open;
  desc2.text = desc.lead_whitespace + open + desc.prefix + desc.content.slice(breakpoint);
  desc2.type = desc.type;
  desc2.parsed = false;

  return [desc1, desc2];
}

function findTokenSplit(desc: LineDesc, tokens: string[], lineCount: number) {
  const endOfPrefix = desc.lead_whitespace.length + desc.open.length + desc.prefix.length;
  let remaining = endOfPrefix  + desc.content.length;

  let tokenSplitIndex = -1;

  // Edge case for trailing whitespace in last line of block comment.

  if (desc.type === 'block' && desc.index + 1 === lineCount && remaining <= 
    desc.scan_state.max_line_length) {
    return - 1;
  }

  for (let i = tokens.length - 1; i > -1; i--) {
    const token = tokens[i];

    // If moving this content token to the next line would leave only the prefix remaining for the
    // current line, it means that we parsed a token that starts immediately after the prefix, which
    // only happens when there is one large token starting the content that itself causes the line
    // to overflow. In this case we do not want to decrement remaining and we do not want to set the
    // index as found. This may not have been the only token on the line, it is just the last
    // visited one that no longer fits, so the index could either be -1 or some later index for some
    // subsequent token that only starts after the threshold. We break here because we know there is
    // no longer a point in looking at earlier tokens.

    if (remaining - token.length === endOfPrefix) {
      // Reset the index. If we ran into a big token at the start, it means we are going to have to
      // hard break the token itself.
      tokenSplitIndex = -1;
      break;
    }

    // Handle those tokens that are positioned entirely after the threshold. Removing the tokens
    // leading up to this token along with this token are not enough to find a split. We need to
    // continue searching backward. Shift the index, since this is a token that will be moved.
    // Update remaining, since this is a token that will be moved.

    if (remaining - token.length > desc.scan_state.max_line_length) {
      tokenSplitIndex = i;
      remaining -= token.length;
      continue;
    }

    // Handle a token spanning the threshold. Since we are iterating backwards, we want to stop
    // searching the first time this condition is met. This is the final token to move.

    if (remaining - token.length <= desc.scan_state.max_line_length) {
      tokenSplitIndex = i;
      remaining -= token.length;
      break;
    }
  }

  // Account for soft break preceding hyphenated word.

  if (tokenSplitIndex > 0 && tokens[tokenSplitIndex] === '-' &&
    remaining - tokens[tokenSplitIndex - 1].length > endOfPrefix) {
    tokenSplitIndex--;
  }

  return tokenSplitIndex;
}

function shouldSplit(desc: LineDesc, lineCount: number) {
  // If the line contains a directive then do not split.
  if (desc.directive) {
    return false;
  }

  // Basic desc structure:
  // lead space | open | prefix | content | suffix | close | unspecified

  if (desc.text.length <= desc.scan_state.max_line_length) {
    return false;
  }

  if (desc.lead_whitespace.length >= desc.scan_state.max_line_length) {
    return false;
  }

  if (desc.lead_whitespace.length + desc.open.length >= desc.scan_state.max_line_length) {
    return false;
  }

  if (desc.lead_whitespace.length + desc.open.length + desc.prefix.length >= 
    desc.scan_state.max_line_length) {
    return false;
  }

  // The logic is different for the last line of a block comment that contains whitespace following 
  // the content and the closing syntax. For all other lines of a block comment the trailing 
  // whitespace does not count towards the threshold. Here we can ignore those lines that are not 
  // on the last line of a multiline block comment where the visual content, which is basically the 
  // content less the trailing whitespace, is under the limit. We only want to split a line when the 
  // visual content is over the limit. We can ignore the suffix whitespace. That is not our concern.

  if (desc.index + 1 < lineCount && desc.lead_whitespace.length + desc.open.length + 
    desc.prefix.length + desc.content.length <= desc.scan_state.max_line_length)  {
    return false;
  }

  // Otherwise, if we are on the last line of a block comment, then the whitespace characters
  // leading up to the closing syntax do matter, and we only want to split if the length up to and
  // including the closing syntax is over the limit.

  if (desc.index + 1 === lineCount && desc.lead_whitespace.length + desc.open.length + 
    desc.prefix.length +  desc.content.length + desc.suffix.length + desc.close.length <= 
    desc.scan_state.max_line_length) {
    return false;
  }

  // Ignore @see JSDoc lines as these tend to contain long urls

  if (desc.type === 'block' && desc.prefix?.startsWith('*') && desc.markup?.startsWith('@see')) {
    return false;
  }

  // The content is over the limit and we want to break

  return true;
}

function findLineBreakChars(context: eslint.Rule.RuleContext) {
  // eslint's AST apparently does not contain line break tokens (?) so we scan the text.
  const text = context.getSourceCode().getText();
  // ripped from eslint/shared/ast-utils
  const matches = /\r\n|[\r\n\u2028\u2029]/u.exec(text);
  return matches ? matches[0] : '\n';
}

interface LineDesc {
  parsed: boolean;

  /**
   * The position of the descriptor within the array of descriptors. Much of the time this is 
   * basically the index of the line in the array of lines of the set of comments comprising a 
   * single group.
   */
  index: number;

  scan_state: ScanState;

  /**
   * The type of the group of comments where this desc is one of the lines of one of the comments in 
   * the group.
   */
  type: 'block' | 'line';

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
   * slashes.
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

/**
 * Populates some of the desc fields based on the desc contents.
 */
function parseLineDesc(desc: LineDesc, lineCount: number) {
  // For idempotency, we reset. This avoids leaving around some properties as set from a previous 
  // parse. A little wasteful but it is convenient.

  desc.lead_whitespace = '';
  desc.open = '';
  desc.prefix = '';
  desc.content = '';
  desc.suffix = '';
  desc.close = '';
  desc.markup = '';
  desc.markup_space = '';
  desc.directive = '';
  desc.fixme = '';

  desc.parsed = true;

  if (desc.type === 'line') {
    const parts = /^(\s*)(\/\/)(\s*)(.*)/.exec(desc.text);
    desc.lead_whitespace = parts[1];
    desc.open = parts[2];
    desc.prefix = parts[3];
    desc.content = parts[4].trimEnd();
    desc.suffix = parts[4].slice(desc.content.length);
    desc.close = '';
  } else if (desc.type === 'block') {
    if (lineCount === 1) {
      const parts = /^(\s*)(\/\*)(\*?\s*)(.*)(\*\/)/.exec(desc.text);
      desc.lead_whitespace = parts[1];
      desc.open = parts[2];
      desc.prefix = parts[3];
      desc.content = parts[4].trimEnd();
      desc.suffix = parts[4].slice(desc.content.length);
      desc.close = parts[5];
    } else if (desc.index === 0) {
      const parts = /^(\s*)(\/\*)(\*?\s*)(.*)/.exec(desc.text);
      desc.lead_whitespace = parts[1];
      desc.open = parts[2];
      desc.prefix = parts[3];
      desc.content = parts[4].trimEnd();
      desc.suffix = parts[4].slice(desc.content.length);
      desc.close = '';
    } else if (desc.index === lineCount - 1) {
      const parts = /^(\s*)(\*?\s*)(.*)(\*\/)/.exec(desc.text);
      desc.lead_whitespace = parts[1];
      desc.open = '';
      desc.prefix = parts[2];
      desc.content = parts[3].trimEnd();
      desc.suffix = parts[3].slice(desc.content.length);
      desc.close = parts[4];
    } else {
      const parts = /^(\s*)(\*?\s*)(.*)/.exec(desc.text);
      desc.lead_whitespace = parts[1];
      desc.open = '';
      desc.prefix = parts[2];
      desc.content = parts[3].trimEnd();
      desc.suffix = parts[3].slice(desc.content.length);
      desc.close = '';
    }
  }

  if (desc.type === 'block') {
    const [markup, markupSpace] = parseMarkup(desc);
    desc.markup = markup;
    desc.markup_space = markupSpace;
  }

  desc.directive = parseDirective(desc);

  const fixmes = /^(fix|fixme|todo|note|bug|warn|warning|hack|todo\([^)]*\))(:)/is.exec(
    desc.content
  );

  if (fixmes) {
    desc.fixme = fixmes[1];
  }

  return desc;
}

function parseMarkup(desc: LineDesc) {
  if (!desc.prefix.startsWith('*')) {
    return ['', ''];
  }

  if (!desc.content.length) {
    return ['', ''];
  }

  const jsdocMatches = /^(@[a-zA-Z]+)(\s*)/.exec(desc.content);
  if (jsdocMatches) {
    return [jsdocMatches[1], jsdocMatches[2] ? jsdocMatches[2] : ''];
  }

  const listMatches = /^([*-]|\d+\.|#{1,6})(\s+)/.exec(desc.content);
  if (listMatches) {
    return [listMatches[1], listMatches[2]];
  }

  if (/^\|.+\|$/.test(desc.content)) {
    return [desc.content, ''];
  }

  return ['', ''];
}

function parseDirective(desc: LineDesc) {
  if (desc.index === 0) {
    const matches = /^(globals?\s|jslint\s|tslint:\s|property\s|eslint\s|jshint\s|istanbul\s|jscs\s|eslint-env|eslint-disable|eslint-enable|eslint-disable-next-line|eslint-disable-line|exported|@ts-check|@ts-nocheck|@ts-ignore|@ts-expect-error)/.exec(desc.content);
    if (matches) {
      return matches[1].trimEnd();
    }
  }

  if (desc.type === 'line' && /^\/\s*<(reference|amd)/.test(desc.content)) {
    return desc.content.slice(1).trimLeft();
  }
}

function tokenize(value: string) {
  const matches = value.matchAll(/[^\s-]+|(?:\s+|-)/g);
  const tokens: string[] = [];

  for (const match of matches) {
    tokens.push(match[0]);
  }

  return tokens;
}
