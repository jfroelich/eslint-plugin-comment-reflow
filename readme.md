# eslint-plugin-comment-reflow
This plugin is currently in alpha. It has quite a few bugs. If you encounter one, please create an 
issue and give an example of the problematic comment.

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
1. `npm install --save-dev eslint-plugin-comment-reflow`
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
  "rules": [
    "comment-reflow/comment-length": [
      "error",
      100
    ]
  ]
}
```
The second element of the array is the point at which to wrap lines.

4. Optionally configure some other rules. It is highly recommended to turn on `no-trailing-spaces`
and to use the same maximum length as `max-len`.
5. Due to some oddities in VSCode, you may need to reload the UI in VSCode or restart VSCode.
6. Verify the plugin is up and running in VSCode. Check the ESLint output. View the bottom panel, 
switch to the OUTPUT tab, and select ESLint from the drop down menu. You should see a couple 
messages about the server starting, and that the library was loaded. If you see a bunch of error 
messages then you have to debug your eslint config.

## Use
If you enable format on save in VSCode, lines will be automatically split and/or merged the moment
you save a document you are editing.