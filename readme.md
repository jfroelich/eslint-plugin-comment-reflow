# eslint-plugin-reflow

Alpha. Pretty broken. Just a hobby project to help me deal with frustrations with linting. Either I 
suck at searching or this seems to be a missing feature of eslint.

## How it works
The method is convoluted primarily to work with eslint. The first insight involves microedits. One
approach would make several edits at once, and the other makes one edit at a time. Instinct said
make a bunch of edits at once, and I tried this first. Did not work so well. Especially given how
eslint wants you to apply sequential fixes. So I chose the one edit at a time approach. eslint docs
state that this is the preferred way of fixing errors. As a consequence, the decision making
regarding what happens after an edit is made differs. The side effects of each sequential edit needs
to be considered in a many-edits-at-once approach but less so in a single edit approach. This allows
for interleaving of other fixes in between the edits. For example, this might wrap a line in a first
pass, at which point the indent rule comes into play, and only then the next pass is made,
independent of the first pass. The interleaving indent might change the outcome. Each pass sees a
fresh state. Now, consider what happens when the many edits approach has a different understanding
of the proper amount of indentation to use, which is a shared concern. And consider that the indent
rule exists apart from this rule, outside of this plugin's control. There is almost no other choice.
Using microedits increases the compatibility of the rule, because each subsequent pass takes into
account all the microedits coming from all the other rules. While there is maybe some degree of
inefficiency, the microedits approach actually feels simpler.

The second insight regards underflow. Overflow is when a line is too long. Underflow is when a line
is too short. In an overflow fix there is a wrap, which usually causes some small amount of text on
the next line. The side effect of wrapping is that it potentially causes the situation where the
next two lines are both short; short enough that it makes sense to merge the next two lines
together. So a word wrap algorithm is counterintuitively not only concerned with splitting lines up
by moving some words into subsequent lines, it is also concerned with merging lines together, and
moving some words into preceding lines.

The third thing regards how to iterate over comments. ESLint docs say to use an AST selector so that
you can optimally visit only the relevant nodes. Then it says comments are not in the AST, and that
the only way to visit comments is to use the comments array. Then it turns out that comments are not
clearly linked to lines. Instead, we have to iterate over comments, and then iterate over the lines
involved in each comment.

## dev notes
* install local, use `npm install ./localpath`
* https://eslint.org/docs/developer-guide/working-with-rules
* https://eslint.org/docs/developer-guide/working-with-custom-parsers
