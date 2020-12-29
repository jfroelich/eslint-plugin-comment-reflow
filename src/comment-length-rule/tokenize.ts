/**
 * Split a string into an array of word, hyphen, and space tokens.
 */
export function tokenize(string: string) {
  const matches = string.matchAll(/[^\s-]+|(?:\s+|-)/g);
  const tokens: string[] = [];

  for (const match of matches) {
    tokens.push(match[0]);
  }

  return tokens;
}
