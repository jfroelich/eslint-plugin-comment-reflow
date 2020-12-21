# eslint-plugin-reflow

Under construction

## dev notes

* install local, use `npm install ./localpath`
* https://eslint.org/docs/developer-guide/working-with-rules
* https://eslint.org/docs/developer-guide/working-with-custom-parsers
* TODO: eventually rewrite in typescript
* `Program(node) { ... }` is object property shorthand for `Program: function(node) { ... }`
* comments are not in the AST, so we cannot use a comment selector, we have to access the comments 
in another way, via eslint facade
* comments will be either type Line or Block. Comments are type Block when using a multiline comment 
and type Line when using a single line comment. so I think that even though comments are not real 
AST nodes, we call them nodes, because these objects have node properties.
* nodes have a range. if we think of the file content as a large character array, the range is the 
index of the start of the node and the end of the node. whitespace nodes are separated so whitespace
surrounding the node is not a part of the node. so range here is generally not useful and not 
something we care about in this use case
* we cannot simply look at node's start column as 0 to determine if column is full line. comment 
blocks can be indented. when indented it is still something we want to possibly reflow. when 
indented the start column is not 0. the condition has to be something more like, is the preceding 
node on the same line.
* single line comments are separate nodes. this means we need to get creative. when looking at a 
single single line comment, we need to look at its adjacent nodes. if those are also single line 
comments, then we want to treat the set of nodes as a pseudo block.
* for block comments, the whole block is the one node. it is not split up into lines. this means it 
is not straightforward comment length check. a block can span multiple lines. so we need to figure 
out what are the lines of a block comment. we can do this by parsing the comment value. but i think 
this is actually bad practice. we are not supposed to re-parse. we also have to match the line 
parsing algorithm used by eslint, or the loc.end.line value of the node will not match up with how 
we split up the block into lines. so maybe we want to do something really wacky, like also iterate 
over the lines of the source code (eslint gives us an array of lines), and look at the overlap of 
each comment block and its lines, and get all lines covered by the block or something.
* regarding what to call context.report with, i am unclear, do we use the whole program, do we use 
the whole comment block, or do we specify some kind of custom subrange?
* we need to consider overflow as well as underflow. overflow is when the length of the line exceeds
the desired maximum length. underflow is harder. it is when the line does not exceed the maximum 
length, and is adjacent to a line that does not exceed the maximum length. we might want two rules 
or we might want the same rule. i am not sure. when there is overflow we want to split the line into
multiple lines. when there is underflow we want to merge the lines into one line and/or then split 
again.
* range (number[]) is an array of two numbers. Both numbers are a 0-based index which is the 
position in the array of source code characters. The first is the start position of the node, the 
second is the end position of the node. code.slice(node.range[0], node.range[1]) must be the text of 
the node. This range does not include spaces/parentheses which are around the node.
* https://jslint.com/help.html JSLint provides three directives that may be placed in a file to 
manage JSLint’s behavior. Use of these directives is optional. If they are used, they should be 
placed in a source file before the first statement. They are written in the form of a comment, where 
the directive name is placed immediately after the opening of the comment before any whitespace. The 
three directives are global, jslint, and property. Directives in a file are stronger than options 
selected from the UI or passed with the option object.

* TODO: refactor underflow single line logic, and maybe the block logic too.  we do not need to be 
  searching the entire next line. We only need to search up to the maximum that can be fit in the 
  current line. provided that limiting the search space is more efficient than just searching and 
  checking afterward. limiting the search space might require more effort than it is worth.
* TODO: if we search for multiple tokens then we have to respect consecutive whitespace in the right 
  way, we shouldn't be mutating the whitespace except in the sole case of the leading whitespace 
  before the content, where we will be inserting our own space.
* TODO: eslint/typescript directives/pragmas in block comments
* TODO: typescript triple-slash-directive /// (added but not tested)
* TODO: line rules inside block comments
* TODO: eslint "global"
* TODO: handle trailing comments correctly
* TODO: handle sandwiched multiline comments correctly
* TODO: test block comment lines that do not use leading asterisk
* TODO: write in typescript
* TODO: tests