import * as util from '../comment-length-rule/util';

// the visual length of a\t\t should be 8. there is one tab stop that is 4, and another tab stop
// that contains a so it is also 4
// util.vislen('a\t\t', 4);

//a		b

// this should be 10

util.vislen('a\t\tb', 4);
