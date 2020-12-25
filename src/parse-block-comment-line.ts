import eslint from 'eslint';
import estree from 'estree';

export interface LineData {
  text: string;
  text_trimmed_start: string;
  prefix: string;

  /**
   * Includes trailing whitespace. Excludes the final asterisk and slash of block.
   */
  content: string;
}

/**
 * Partially tokenize a block comment line and shove some of the tokens back into the context.
 */
export function parseBlockCommentLine(code: eslint.SourceCode, comment: estree.Comment,
  line: number) {
  const output: Partial<LineData> = {};

  output.text = code.lines[line - 1];
  output.text_trimmed_start = output.text.trimStart();

  output.prefix = '';
  if (line === comment.loc.start.line) {
    const matches = /^\/\*\*?\s*/.exec(output.text_trimmed_start);
    if (matches && matches.length === 1) {
      output.prefix = matches[0];
    }
  } else {
    const matches = /^\*\s*/.exec(output.text_trimmed_start);
    if (matches && matches.length === 1) {
      output.prefix = matches[0];
    }
  }

  output.content = '';
  if (line === comment.loc.end.line) {
    output.content = output.text_trimmed_start.slice(output.prefix.length, -2);
  } else {
    output.content = output.text_trimmed_start.slice(output.prefix.length);
  }

  return <Required<LineData>>output;
}
