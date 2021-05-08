import eslint from 'eslint';
import estree from 'estree';

interface ScanState {
  max_line_length: number;
  line_break_chars: string;
  program: estree.Program;
  context: eslint.Rule.RuleContext;
}

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

function processCommentBuffer(buffer: estree.Comment[], state: ScanState) {
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

  for (let line = buffer[0].loc.start.line; line <= buffer[buffer.length - 1].loc.end.line;
    line++) {
    const lineText = state.context.getSourceCode().lines[line - 1];
    console.log('Line: %d "%s"', line - 1, lineText);
  }
}

function findLineBreakChars(context: eslint.Rule.RuleContext) {
  // eslint's AST apparently does not contain line break tokens (?) so we scan the text.
  const text = context.getSourceCode().getText();
  // ripped from eslint/shared/ast-utils
  const matches = /\r\n|[\r\n\u2028\u2029]/u.exec(text);
  return matches ? matches[0] : '\n';
}
