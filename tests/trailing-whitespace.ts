import eslint from 'eslint';
import commentLengthRule from '../src/comment-length-rule';

// A line comment where the content of the line is under the limit but the trailing whitespace is
// over the limit should not trigger a split error. This avoids penalizing authors who do not use
// no trailing spaces.

// TODO: add a second test case for final line of block comment with trailing whitespace

const tester = new eslint.RuleTester();

tester.run('line-trailing-whitespace', commentLengthRule, {
  valid: [
    {
      code: '// 01234567890123456     ',
      options: [20],
    }
  ],
  invalid: [
    {
      code: '// 01234567890123456     7',
      options: [20],
      errors: [
        {
          messageId: 'split'
        }
      ],
      output: '// 01234567890123456     \n// 7'
    }
  ]
});
