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
  create: function (context: eslint.Rule.RuleContext) {
    return <eslint.Rule.RuleListener>{
      Program: program => scan(program, context)
    };
  }
};

function scan(program: estree.Program, context: eslint.Rule.RuleContext) {
  const maxLineLength = context.options?.length && Number.isInteger(context.options[0]) ?
    <number>context.options[0] : 80;
  const lineBreakChars = findLineBreakChars(context);

  const sourceCode = context.getSourceCode();
  const comments = sourceCode.getAllComments();

  // Process the comments sequentially. We start by accumulating the comments into a small buffer
  // that either consists of a single block comment or one or more line comments. We process the
  // buffer each time we detect a non-contiguous comment or type change. We process whole buffers
  // instead of individual lines because of strange eslint issues with generating many adjacent
  // sequential fixes and to perform less rewriting. Any split can trigger the need to reflow again
  // due to newly introduced underflow if changes are done per line, which is what an earlier
  // version did, but it did not work so well.

  let buffer: estree.Comment[] = [];

  for (let commentIndex = 0; commentIndex < comments.length; commentIndex++) {
    const comment = comments[commentIndex];

    if (comment.type === 'Block') {
      if (buffer.length) {
        processCommentBuffer(buffer, program, maxLineLength, lineBreakChars);
        buffer = [];
      }

      const beforeToken = sourceCode.getTokenBefore(comment, { includeComments: true });
      const afterToken = sourceCode.getTokenAfter(comment, { includeComments: true });
      if ((!beforeToken || beforeToken.loc.end.line < comment.loc.start.line) &&
        (!afterToken || afterToken.loc.start.line > comment.loc.end.line)) {
        buffer.push(comment);
      }
    } else if (comment.type === 'Line') {
      const beforeToken = sourceCode.getTokenBefore(comment, { includeComments: true });
      if (!beforeToken || beforeToken.loc.end.line < comment.loc.start.line) {
        if (buffer.length && buffer[buffer.length - 1].type === 'Line' &&
          buffer[buffer.length - 1].loc.start.line === comment.loc.start.line - 1) {
          buffer.push(comment);
        } else {
          if (buffer.length) {
            processCommentBuffer(buffer, program, maxLineLength, lineBreakChars);
            buffer = [];
          }

          buffer.push(comment);
        }
      } else {
        // the comment cannot be processed.
        if (buffer.length) {
          processCommentBuffer(buffer, program, maxLineLength, lineBreakChars);
          buffer = [];
        }
      }
    } else {
      // other comment types count as buffer breaks
      if (buffer.length) {
        processCommentBuffer(buffer, program, maxLineLength, lineBreakChars);
        buffer = [];
      }
    }
  }

  // We must take care to process the final buffer.

  if (buffer.length) {
    processCommentBuffer(buffer, program, maxLineLength, lineBreakChars);
  }

  // Unlike before, we do not gather reports and then generate all the reports. We instead generate
  // reports online, as we detect them.
}

function processCommentBuffer(buffer: estree.Comment[], program: estree.Program,
  maxLineLength: number, lineBreakChars: string) {
  // TEMP: these are not yet in use but will be
  console.log('program:', typeof program);
  console.log('max line length:', maxLineLength);
  console.log('line break chars:', lineBreakChars);

  // TEMP: just previewing what the buffer looks like in development
  console.log('%s(s):', buffer[0].type, buffer.map(comment => comment.value.trim()).join(','));

  // TODO: we get a buffer consisting of either one block comment or one or more line comments.
  // the next step is to process the comment lines. we are dealing with either all the lines of
  // one block comment, or each line of different line comments.
  // it is quite possible we actually want to be working with a buffer of lines here instead of
  // comments but we lose out on a lot of comment properties this way.

  // the gist of the algorithm is this: we parse a line. if it overflows, we merge it into the
  // next line. if it underflows, we merge the next line into it. we somehow build some
  // replacement text. if at least one change was made, we mark the whole comment as flawed, and
  // report a fix that replaces the whole comment with the replacement text.
}

function findLineBreakChars(context: eslint.Rule.RuleContext) {
  // eslint's AST apparently does not contain line break tokens (?) so we scan the text.
  const text = context.getSourceCode().getText();
  // ripped from eslint/shared/ast-utils
  const matches = /\r\n|[\r\n\u2028\u2029]/u.exec(text);
  return matches ? matches[0] : '\n';
}
