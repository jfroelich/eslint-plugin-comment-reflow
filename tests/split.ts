import eslint from 'eslint';
import { commentLengthRule } from '../src/comment-length-rule';

const config: eslint.Linter.Config = {
  parserOptions: {
    ecmaVersion: 2020
  }
};

const tester = new eslint.RuleTester(config);

tester.run('simple-split-expected', commentLengthRule, {
  valid: [
    {
      code: `
// 01234567890123456
`,
      options: [20],
    }
  ],
  invalid: [
    {
      code: `
// 01234567890123456789
`,
      options: [20],
      errors: [
        {
          messageId: 'split'
        }
      ],
      output: `
// 01234567890123456
// 789
`
    }
  ]
});
