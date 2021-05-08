import eslint from 'eslint';
import commentLengthRule from '../src/comment-length-rule';

const tester = new eslint.RuleTester();

tester.run('simple-split-line', commentLengthRule, {
  valid: [
    {
      code: '// 01234567890123456',
      options: [20],
    }
  ],
  invalid: [
    {
      code: '// 01234567890123456789',
      options: [20],
      errors: [
        {
          messageId: 'split'
        }
      ],
      output: '// 01234567890123456\n// 789'
    }
  ]
});
