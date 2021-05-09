import eslint from 'eslint';
import commentLengthRule from '../src/comment-length-rule';

const tester = new eslint.RuleTester();

tester.run('does-it-run', commentLengthRule, {
  valid: [
    {
      code: `
// 012345678901234567
// 01234567890
// 01234567890
// 01234567890
var x = 1;
`,
      options: [20],
    }
  ],
  invalid: []
});
