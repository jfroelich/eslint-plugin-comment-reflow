import eslint from 'eslint';
import commentLengthRule from '../src/comment-length-rule';

const tester = new eslint.RuleTester();

tester.run('simple-split-block', commentLengthRule, {
  valid: [
    {
      code: '/*0123456789*/',
      options: [20],
    }
  ],
  invalid: [
    {
      code: '/*01234567890123456789*/',
      options: [20],
      errors: [
        {
          messageId: 'split'
        }
      ],
      output: '/*012345678901234567\n89*/'
    }
  ]
});
