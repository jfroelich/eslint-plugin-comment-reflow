/**
 * Split a string into tokens. Returns an array of strings that contains both word tokens and
 * whitespace tokens in order of appearance.
 */
export function tokenize(string: string) {
  const matches = string.matchAll(/\S+|\s+/g);
  const tokens: string[] = [];

  for (const match of matches) {
    tokens.push(match[0]);
  }

  return tokens;
}
