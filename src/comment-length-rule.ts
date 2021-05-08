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
    return <eslint.Rule.RuleListener>{
      Program: program => scan(program, context)
    };
  }
};

function scan(program: estree.Program, context: eslint.Rule.RuleContext) {
  const state = <ScanState>{};
  state.program = program;
  state.context = context;
  state.max_line_length = context.options?.length && Number.isInteger(context.options[0]) ?
    <number>context.options[0] : 80;
  state.line_break_chars = findLineBreakChars(context);

  const sourceCode = context.getSourceCode();
  const comments = sourceCode.getAllComments();

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
      const beforeToken = sourceCode.getTokenBefore(comment, { includeComments: true });
      if (!beforeToken || beforeToken.loc.end.line < comment.loc.start.line) {
        if (buffer.length && buffer[buffer.length - 1].type === 'Line' &&
          buffer[buffer.length - 1].loc.start.line === comment.loc.start.line - 1) {
          buffer.push(comment);
        } else {
          processCommentBuffer(buffer, state);
          buffer = [];
          buffer.push(comment);
        }
      } else {
        processCommentBuffer(buffer, state);
        buffer = [];
      }
    } else {
      processCommentBuffer(buffer, state);
      buffer = [];
    }
  }

  processCommentBuffer(buffer, state);

  // Unlike before, we do not gather reports and then generate all the reports. We instead generate
  // reports online, as we detect them.
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
