import eslint from 'eslint';
import estree from 'estree';

export default <eslint.Rule.RuleModule>{
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: {
      reflow: 'Comment line {{line}} needs reflow.'
    }
  },
  create: createRuleListener
};

function createRuleListener(context: eslint.Rule.RuleContext) {
  return <eslint.Rule.RuleListener>{
    Program: program => scan(program, context)
  };
}

function scan(program: estree.Program, context: eslint.Rule.RuleContext) {
  const maxLineLength = context.options?.length &&
    Number.isInteger(context.options[0]) ? <number>context.options[0] : 80;
  const lineBreakChars = findLineBreakChars(context);

  console.log('max line length:', maxLineLength);
  console.log('line break chars:', lineBreakChars);

  const sourceCode = context.getSourceCode();
  const comments = sourceCode.getAllComments();

  // Process the comments sequentially. We start by accumulating the comments into a small buffer
  // that either consists of a single block comment or one or more line comments. We process the
  // buffer each time we detect a non-contiguous comment or type change.

  let buffer: estree.Comment[] = [];

  for (let commentIndex = 0; commentIndex < comments.length; commentIndex++) {
    const comment = comments[commentIndex];

    if (buffer.length && comment.type !== 'Line') {
      if (buffer.length) {
        processCommentBuffer(buffer);
        buffer = [];
      }

      // We are dealing with either a hash or block comment. Append the comment to the buffer if it
      // is a block comment and it is the only token on its line(s).

      if (comment.type == 'Block') {
        const beforeToken = sourceCode.getTokenBefore(comment, { includeComments: true });
        const afterToken = sourceCode.getTokenAfter(comment, { includeComments: true });
        if ((!beforeToken || beforeToken.loc.end.line < comment.loc.start.line) &&
          (!afterToken || afterToken.loc.start.line > comment.loc.end.line)) {
          buffer.push(comment);
        }
      }
    } else {
      // the current comment is a line comment.

      const beforeToken = sourceCode.getTokenBefore(comment, { includeComments: true });
      if (!beforeToken || beforeToken.loc.end.line < comment.loc.start.line) {
        // the comment can be processed. decide whether to append it to the buffer

        if (buffer.length && buffer[buffer.length - 1].type === 'Line' &&
          buffer[buffer.length - 1].loc.start.line === comment.loc.start.line - 1) {
          // this is a contiguous single line comment
          buffer.push(comment);
        } else {
          // this is not contiguous. process the current buffer, reset it, then append.
          if (buffer.length) {
            processCommentBuffer(buffer);
            buffer = [];
          }

          buffer.push(comment);
        }
      } else {
        // the comment cannot be processed.
        if (buffer.length) {
          processCommentBuffer(buffer);
          buffer = [];
        }
      }
    }
  }

  // We must take care to process the final buffer.

  if (buffer.length) {
    processCommentBuffer(buffer);
  }

  function processCommentBuffer(buffer: estree.Comment[]) {
    console.log('Processing buffer of %d comments', buffer.length);

    // TODO: we get a buffer consisting of either one block comment or one or more line comments.
    // the next step is to process the comment lines.

    for (const comment of buffer) {
      // temporary
      console.log('comment:', comment);
    }
  }
}

function findLineBreakChars(context: eslint.Rule.RuleContext) {
  // eslint's AST apparently does not contain line break tokens (?) so we scan the text.

  const text = context.getSourceCode().getText();
  // ripped from eslint/shared/ast-utils
  const matches = /\r\n|[\r\n\u2028\u2029]/u.exec(text);
  return matches ? matches[0] : '\n';
}
