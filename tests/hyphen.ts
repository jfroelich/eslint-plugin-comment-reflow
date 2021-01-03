import eslint from 'eslint';
import commentLengthRule from '../src/comment-length-rule';

// TODO: add more cases here, e.g. when hyphen is used to split, does hyphen end up on next line

const tester = new eslint.RuleTester();

tester.run('hyphen-line-split', commentLengthRule, {
  valid: [
    {
      code: '',
      options: [20],
    }
  ],
  invalid: [
    {
      code: '// TESTTESTT STTEST- B',
      options: [20],
      errors: [
        {
          messageId: 'split'
        }
      ],
      output: '// TESTTESTT STTEST- \n// B'
    }
  ]
});
