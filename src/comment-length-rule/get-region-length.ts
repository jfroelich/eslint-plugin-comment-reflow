import { CommentLine } from './comment-line';

type Region = keyof Pick<CommentLine,
  'lead_whitespace' | 'open' | 'close' | 'prefix' | 'content' | 'suffix' | 'close'>;

/**
 * Returns the length of the text in the given line up to the end of the given region.
 */
export function getRegionLength(line: CommentLine, region: Region) {
  switch (region) {
    case 'lead_whitespace': {
      return line.lead_whitespace.length;
    }

    case 'open': {
      return line.lead_whitespace.length + line.open.length;
    }

    case 'prefix': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length;
    }

    case 'content': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length;
    }

    case 'suffix': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + line.suffix.length;
    }

    case 'close': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + line.suffix.length + line.close.length;
    }

    default: {
      throw new Error(`Unknown/unsupported region "${<string>region}"`);
    }
  }
}
