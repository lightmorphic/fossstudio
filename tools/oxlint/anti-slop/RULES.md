# The three rules that are off, and why

The skill that brought these rules in enables all of them. Three do not
belong in this codebase, and turning them off with a reason written down
is better than leaving them on to fail forever - a check nobody can pass
is a check nobody runs.

**`no-runtime-typeof`** says a `typeof` check narrows a representation
without establishing a contract, and that input should be parsed at its
boundary instead. That is sound advice in TypeScript. FOSSStudio is plain
JavaScript: `typeof patch.wallpaper === "string"` in the settings is the
parse at the boundary, and there is nothing else to replace it with. Ten
findings, every one of them checking something a browser sent us.

**`no-array-filter-map`** objects to `filter(...).map(...)` because it
walks the array twice. Ours walk the format tables, the
people in one room, and the microphones that dropped out - a handful of
rows each time. Rewriting them as `flatMap` with a conditional array
inside would trade a sentence anybody can read for a saving of nothing.

**`require-readable-spacing`** wants a blank line before most
statements. It had 2,346 opinions about this repository. They are blank
lines rather than code, and the style they ask for is not the one this
was written in: a short validator of six guard clauses reads better
tight than spread over twice the lines. This is somebody else's house
style, not a defect.

Everything else is on and the repository is clean. If a run is ever
noisy again, that is a finding rather than a thing to switch off.
