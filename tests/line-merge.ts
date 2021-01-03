import eslint from 'eslint';
import commentLengthRule from '../src/comment-length-rule';

const tester = new eslint.RuleTester();

tester.run('line-merge', commentLengthRule, {
  valid: [
    {
      code: `
// aaaaaaaaaaaa bb
`,
      options: [20],
    }
  ],
  invalid: [
    {
      code: `
// aaaaaaaaaaaa
// bb
`,
      options: [20],
      errors: [
        {
          messageId: 'merge'
        }
      ],
      output: `
// aaaaaaaaaaaa bb
`
    }
  ]
});
