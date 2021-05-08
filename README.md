# eslint-plugin-comment-reflow
This plugin is currently in alpha. It has quite a few bugs.

Tabs are not currently supported, but I do plan to support them sometime in the future.

This plugin adds a new custom rule to eslint that will trigger a linting error either when a line is 
too long and should be split into two lines or when two lines are too short and should be merged. 
This plugin supports `--fix` and can automatically reflow the lines so that they are neither too 
long or too short.

The plugin recognizes some sections of comments as special and chooses to not merge in some cases. 
For example, a blank line is not merged. A line that begins with a JSDoc annotation is not merged.
A line that begins with a markdown list is not merged.

The plugin tries to respect indentation both outside and inside of a multi-line comment. If a line 
is split, the new line will also be indented.
## Setup
1. `npm install --save-dev eslint-plugin-comment-reflow`. The NPM url is 
https://www.npmjs.com/package/eslint-plugin-comment-reflow.
2. Add the plugin to eslint config:
```json
{
  "plugins": [
    "comment-reflow"
  ]
}
```
Using `eslint-plugin-comment-reflow` as the plugin name also works.

3. Add the rule to the eslint config:
```json
{
  "rules": {
    "comment-reflow/comment-length": [
      "error",
      100
    ]
  }
}
```
The second element of the array is the point at which to wrap lines.

4. It is highly recommended to turn on `no-trailing-spaces`, use the same maximum length as 
`max-len`, and use consistent line breaks with `linebreak-style`.

## Use
If you enable format on save in VSCode, lines will be automatically split and/or merged the moment
you save a document you are editing.