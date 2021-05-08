import eslint from 'eslint';
import commentLengthRule from '../src/comment-length-rule';

const tester = new eslint.RuleTester();

tester.run('does-it-run', commentLengthRule, {
  valid: [
    {
      code: `
// a
// b
/* c */
// d
// e
// f

     // indented g
/* h 
*/
whatever
`,
      options: [20],
    }
  ],
  invalid: []
});
