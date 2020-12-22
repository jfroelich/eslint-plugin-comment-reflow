import eslint from 'eslint';
import estree from 'estree';

export function createBlockCommentLineOverflowReport(node: estree.Node, code: eslint.SourceCode, 
  comment: estree.Comment, line: number, maxLineLength: number, fenced: boolean,
  lineRangeStart: number) {
  if (comment.type !== 'Block') {
    return;
  }

  if (fenced) {
    return;
  }

  let text = code.lines[line - 1];
  if (text.length <= maxLineLength) {
    return;
  }

  text = text.trimStart();

  // Do not treat tslint directives as overflowing

  if (line === comment.loc.start.line && text.startsWith('/* tslint:')) {
    return;
  }

  // Find the last space in the line. We have to be careful to exclude the leading space following 
  // an asterisk.

  let edge = -1;
  if (text.startsWith('* ')) {
    edge = text.slice(2).lastIndexOf(' ', maxLineLength - 2);

    // the slice wreaks some havoc on the offset
    if (edge + 3 > maxLineLength) {
      edge = maxLineLength;
    } else if (edge !== -1) {
      edge = edge + 3;
    }
  } else {
    // we trimmed left. we are starting with * or whatever is first text.
    edge = text.lastIndexOf(' ', maxLineLength);
  }

  const report: eslint.Rule.ReportDescriptor = {
    node,
    loc: comment.loc,
    messageId: 'overflow',
    data: {
      line_length: `${text.length}`,
      max_length: `${maxLineLength}`
    },
    fix: function (fixer) {
      const text = code.lines[line - 1];
      if (edge === -1) {
        const firstOverflowingCharacter = text.charAt(maxLineLength);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n*' : '\n* ';
        return fixer.insertTextAfterRange([0, lineRangeStart + maxLineLength], insertedText);
      } else {
        const firstOverflowingCharacter = text.charAt(edge);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n*' : '\n* ';
        return fixer.insertTextAfterRange([0, lineRangeStart + edge], insertedText);
      }
    }
  };

  return report;
}