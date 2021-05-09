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

function scan(state: ScanState) {
  const sourceCode = state.context.getSourceCode();
  const comments: estree.Comment[] = sourceCode.getAllComments();

  // Sequentially buffer the comments and then process each buffer as it ends.

  let buffer: estree.Comment[] = [];

  for (let commentIndex = 0; commentIndex < comments.length; commentIndex++) {
    const comment = comments[commentIndex];

    if (comment.type === 'Block') {
      processCommentBuffer(buffer, state);
      buffer = [];

      const before = sourceCode.getTokenBefore(comment, { includeComments: true });
      const after = sourceCode.getTokenAfter(comment, { includeComments: true });
      if ((!before || before.loc.end.line < comment.loc.start.line) &&
        (!after || after.loc.start.line > comment.loc.end.line)) {
        buffer.push(comment);
      }
    } else if (comment.type === 'Line') {
      const before = sourceCode.getTokenBefore(comment, { includeComments: true });
      if (before?.loc.end.line === comment.loc.start.line) {
        processCommentBuffer(buffer, state);
        buffer = [];
      } else if (buffer.length && buffer[buffer.length - 1].type === 'Line' &&
        buffer[buffer.length - 1].loc.start.line === comment.loc.start.line - 1) {
        buffer.push(comment);
      } else {
        processCommentBuffer(buffer, state);
        buffer = [];
        buffer.push(comment);
      }
    } else {
      // treat shebangs as buffer breaks
      processCommentBuffer(buffer, state);
      buffer = [];
    }
  }

  // Flush the last buffer.
  processCommentBuffer(buffer, state);
}

function processCommentBuffer(buffer: estree.Comment[], scanState: ScanState) {
  if (buffer.length === 0) {
    return;
  }

  // TODO: iterate over the lines of the buffer. for a line, decide to split a line into two lines
  // or merge two lines into one. keep in mind we want to only parse as needed so as to minimize
  // parsing. i think we do something like mutate the replacement text, and if any mutation done,
  // then we create a report. the problem i am currently wrestling with is how to store the
  // replacement text, and how to "compare to previous". maybe we maintain an array of visited
  // lines of text that will be merged at the end to compose the text. then we can also capture the
  // parsed info per line in that array, and whether that line was "dirtied".

  // * We can only look backward in an online algorithm. Lookahead is cheating. This means logic can
  //   only check the current line and the previous line. It cannot look at the next line.
  // * If we merge the current line into the previous line, the previous line might need to be
  //   reparsed if we plan to visit it again. On the other hand, if there is no plan to visit then I
  //   guess we do not need to reparse.
  // * We parse when we visit a line, if logic is looking at the previous line, and that previous
  //   line was not modified, then we want to avoid reparsing. On the other hand, if that previous
  //   line was modified, then we want to reparse that previous line to gather the properties of it
  //   to make decisions about it. We either reparse immediately after dirtying, or lazily upon
  //   checking whether the current line should be merged into the previous line.
  // * We can tell if dirtied if replacement line count is different than group total line count.
  // * The replacement text lines may not correspond to the input lines. So mapping between the two
  //   is not beneficial. We should probably clone the lines and then mutate the cloned lines as
  //   needed. We do not care about original input properties. But if we clone then do we lose
  //   access to the helper functions provided for by the originals? Do we even need those?

  // First attempt: iterate over the lines. For a line, check if it should be split. if not, append
  // it to visited, then move to the next line. If it should, split it and append two lines to
  // visited.

  // I think the best thing to do is to give up on using eslint helpers. Create our own data 
  // structure and text storage that is independent of eslint. In fact we could have an entire 
  // library for doing this that is independent of eslint, that this plugin then hooks up to eslint.
  // Using our own data structures enables us to parse and reparse visited lines trivially even 
  // though knowledge about the original eslint info has been somewhat lost.

  // TODO: we want to first copy over the inputs into the outputs, because we plan to make multiple 
  // passes and conditionally adjust things in the output, and then test whether the output still 
  // corresponds to the input. for example, because we want to split a line, we insert two lines 
  // into the output in place of the original line, and then we want to move the cursor to before 
  // the second of those two lines and continue scanning.

  // TODO: but we should not create this wrapper around LineDesc. We can reuse LineDesc. We should 
  // be shoving extra properties into it. It should not only represent a parsed line. It should 
  // represent a line that may have been parsed or may not have been parsed. Then we are not parsing
  // the text so much as we are populating the other fields of a LineDesc based on its text value.
  // Then we can work off this array of LineDescs in either parsed or non-parsed states. And we can 
  // mutate them and do things like adjust their indices.

  type ScratchItem = {
    text: string;
    /** optional, contains parsed text info, if parsed */
    desc?: LineDesc;
  };

  const scratch: ScratchItem[] = [];

  


  // const replacement = [];

  const firstComment = buffer[0];
  const lastComment = buffer[buffer.length - 1];
  const bufferLineCount = lastComment.loc.end.line - firstComment.loc.start.line + 1;
  const bufferType: BufferType = firstComment.type === 'Block' ? 'block' : 'line';



  for (let line = firstComment.loc.start.line; line <= lastComment.loc.end.line; line++) {
    const lineText = scanState.context.getSourceCode().lines[line - 1];
    const lineBufferIndex = line - firstComment.loc.start.line;
    const lineDesc = parseLine(bufferType, lineText, lineBufferIndex, bufferLineCount);

    // TODO: inline split logic here, for now, then eventually move into a helper once things make 
    // more sense

    if (shouldSplit(lineDesc, lineBufferIndex, bufferLineCount, bufferType, scanState)) {
      console.log('should split line', lineText);
      // TODO: split the line into two, and append each line to the output. but, we might have to 
      // split the same line multiple times? so we really should be iterating over mutable input?
    } else {
      console.log('should NOT split line', lineText);
      // TODO: append the parsed line to the output as is
    }
  }

  // TODO: if the replacement lines do not correspond to the input lines, then we should indicate a 
  // correction. We want to replace the entire comment. We use the boundaries of the original 
  // comment and then specify replacement text.
}

function shouldSplit(desc: LineDesc, index: number, lineCount: number, type: BufferType, 
  scanState: ScanState) {
  // If the line contains a directive then do not split.
  if (desc.directive) {
    return false;
  }

  // Basic desc structure:
  // lead space | open | prefix | content | suffix | close | unspecified

  if (desc.text.length <= scanState.max_line_length) {
    return false;
  }

  if (desc.lead_whitespace.length >= scanState.max_line_length) {
    return false;
  }

  if (desc.lead_whitespace.length + desc.open.length >= scanState.max_line_length) {
    return false;
  }

  if (desc.lead_whitespace.length + desc.open.length + desc.prefix.length >= 
    scanState.max_line_length) {
    return false;
  }

  // The logic is different for the last line of a block comment that contains whitespace following 
  // the content and the closing syntax. For all other lines of a block comment the trailing 
  // whitespace does not count towards the threshold. Here we can ignore those lines that are not 
  // on the last line of a multiline block comment where the visual content, which is basically the 
  // content less the trailing whitespace, is under the limit. We only want to split a line when the 
  // visual content is over the limit. We can ignore the suffix whitespace. That is not our concern.

  if (index + 1 < lineCount && desc.lead_whitespace.length + desc.open.length + desc.prefix.length + 
    desc.content.length <= scanState.max_line_length)  {
    return false;
  }

  // Otherwise, if we are on the last line of a block comment, then the whitespace characters
  // leading up to the closing syntax do matter, and we only want to split if the length up to and
  // including the closing syntax is over the limit.

  if (index + 1 === lineCount && desc.lead_whitespace.length + desc.open.length + 
    desc.prefix.length +  desc.content.length + desc.suffix.length + desc.close.length <= 
    scanState.max_line_length) {
    return false;
  }

  // Ignore @see JSDoc lines as these tend to contain long urls

  if (type === 'block'  && desc.prefix?.startsWith('*') && desc.markup?.startsWith('@see')) {
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

function parseLine(type: BufferType, text: string, index: number, lineCount: number) {
  const desc = <LineDesc>{};
  desc.text = text;

  if (type === 'line') {
    const parts = /^(\s*)(\/\/)(\s*)(.*)/.exec(text);
    desc.lead_whitespace = parts[1];
    desc.open = parts[2];
    desc.prefix = parts[3];
    desc.content = parts[4].trimEnd();
    desc.suffix = parts[4].slice(desc.content.length);
    desc.close = '';
  } else if (type === 'block') {
    if (lineCount === 1) {
      const parts = /^(\s*)(\/\*)(\*?\s*)(.*)(\*\/)/.exec(text);
      desc.lead_whitespace = parts[1];
      desc.open = parts[2];
      desc.prefix = parts[3];
      desc.content = parts[4].trimEnd();
      desc.suffix = parts[4].slice(desc.content.length);
      desc.close = parts[5];
    } else if (index === 0) {
      const parts = /^(\s*)(\/\*)(\*?\s*)(.*)/.exec(text);
      desc.lead_whitespace = parts[1];
      desc.open = parts[2];
      desc.prefix = parts[3];
      desc.content = parts[4].trimEnd();
      desc.suffix = parts[4].slice(desc.content.length);
      desc.close = '';
    } else if (index === lineCount - 1) {
      const parts = /^(\s*)(\*?\s*)(.*)(\*\/)/.exec(text);
      desc.lead_whitespace = parts[1];
      desc.open = '';
      desc.prefix = parts[2];
      desc.content = parts[3].trimEnd();
      desc.suffix = parts[3].slice(desc.content.length);
      desc.close = parts[4];
    } else {
      const parts = /^(\s*)(\*?\s*)(.*)/.exec(text);
      desc.lead_whitespace = parts[1];
      desc.open = '';
      desc.prefix = parts[2];
      desc.content = parts[3].trimEnd();
      desc.suffix = parts[3].slice(desc.content.length);
      desc.close = '';
    }
  }

  if (type === 'block') {
    const [markup, markupSpace] = parseMarkup(desc);
    desc.markup = markup;
    desc.markup_space = markupSpace;
  }

  desc.directive = parseDirective(type, desc, index);

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

function parseDirective(type: string, desc: LineDesc, index: number) {
  if (index === 0) {
    const matches = /^(globals?\s|jslint\s|tslint:\s|property\s|eslint\s|jshint\s|istanbul\s|jscs\s|eslint-env|eslint-disable|eslint-enable|eslint-disable-next-line|eslint-disable-line|exported|@ts-check|@ts-nocheck|@ts-ignore|@ts-expect-error)/.exec(desc.content);
    if (matches) {
      return matches[1].trimEnd();
    }
  }

  if (type === 'line' && /^\/\s*<(reference|amd)/.test(desc.content)) {
    return desc.content.slice(1).trimLeft();
  }
}
