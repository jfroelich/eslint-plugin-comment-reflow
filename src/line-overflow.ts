import eslint from 'eslint';
import estree from 'estree';

export function createLineCommentLineOverflowReport(node: estree.Node, code: eslint.SourceCode, 
  comment: estree.Comment, line: number, maxLineLength: number, lineRangeStart: number) {
  if (comment.type !== 'Line') {
    return;
  }

  const text = code.lines[line - 1];
  if (text.length <= maxLineLength) {
    return;
  }

  // if there is a comment directive then never overflow

  const content = text.trimStart().slice(2).trimStart();
  if (content.startsWith('eslint-')) {
    return;
  }

  if (content.startsWith('@ts-')) {
    return;
  }

  if (content.startsWith('tslint:')) {
    return;
  }

  // typescript triple slash directive

  if (/^\/\s<(reference|amd)/.test(content)) {
    return;
  }

  const edge = text.lastIndexOf(' ', maxLineLength);

  const report: eslint.Rule.ReportDescriptor = {
    node,
    loc: comment.loc,
    messageId: 'overflow',
    data: {
      line_length: '' + text.length,
      max_length: '' + maxLineLength
    },
    fix: function (fixer) {
      if (edge === -1) {
        const firstOverflowingCharacter = text.charAt(maxLineLength);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n//' : '\n// ';
        return fixer.insertTextAfterRange([0, lineRangeStart + maxLineLength], insertedText);
      } else {
        const firstOverflowingCharacter = text.charAt(edge);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n//' : '\n// ';
        return fixer.insertTextAfterRange([0, lineRangeStart + edge], insertedText);
      }
    }
  };

  return report;
}