import { CommentLineDesc } from '../comment-line-desc';

/**
 * Return the position where to break the text or -1. This only searches in a subregion of the text
 * so as to not match whitespace in other places.
 *
 * @todo can/should this be generalized to use in the Line comment algorithms?
 */
export function findContentBreak(line: CommentLineDesc, maxLineLength: number) {
  // Find nothing when the content is in bounds.
  // TODO: what about suffix here? we sometimes want to count it and sometimes not?

  if (line.lead_whitespace.length + line.open.length + line.prefix.length +
    line.content.length <= maxLineLength) {
    return -1;
  }

  // Determine the search space for searching for space.

  const regionStart = line.lead_whitespace.length + line.open.length + line.prefix.length +
    line.markup.length + line.markup_space.length;
  const regionEnd = Math.min(maxLineLength,
    line.lead_whitespace.length + line.open.length + line.prefix.length + line.content.length);
  const region = line.text.slice(regionStart, regionEnd);

  // Find the last space in the last sequence of spaces.

  const endPos = region.lastIndexOf(' ');

  // Find the first space in the sequence of spaces.

  let startPos = endPos;
  if (startPos > -1) {
    while (region.charAt(startPos - 1) === ' ') {
      startPos--;
    }
  }

  // Return the position in the search space translated to the position in the line.

  return startPos === -1 ? startPos : line.lead_whitespace.length + line.open.length +
    line.prefix.length + line.markup.length + line.markup_space.length + startPos;
}