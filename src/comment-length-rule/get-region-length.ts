import { CommentLine } from './comment-line';

type Region = keyof Pick<CommentLine,
  'lead_whitespace' | 'open' | 'close' | 'prefix' | 'content' | 'suffix' | 'close'>;

/**
 * Returns the length of the text in the given line up to the start or end of the given region. If
 * inclusive is true then this is up to the end of the region.
 */
export function getRegionLength(line: CommentLine, region: Region, inclusive = true) {
  switch (region) {
    case 'lead_whitespace': {
      return inclusive ? line.lead_whitespace.length : 0;
    }

    case 'open': {
      return line.lead_whitespace.length + (inclusive ? line.open.length : 0);
    }

    case 'prefix': {
      return line.lead_whitespace.length + line.open.length + (inclusive ? line.prefix.length : 0);
    }

    case 'content': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        (inclusive ? line.content.length : 0);
    }

    case 'suffix': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + (inclusive ? line.suffix.length : 0);
    }

    case 'close': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + line.suffix.length + (inclusive ? line.close.length : 0);
    }

    default: {
      throw new Error(`Unknown/unsupported region "${<string>region}"`);
    }
  }
}
