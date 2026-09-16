# Contributing

**Bug reports and ideas: yes, please. Pull requests: no, and they will
be closed unread. This is not about your code - please read on, because
the reason is worth ten seconds of your time and it is not the usual
one.**

## What we want, and want badly

- **Bug reports.** Telling us what you did and what happened is worth
  more to us than a patch would be.
- **Security reports.** See `SECURITY.md`. Please report privately.
- **Ideas and questions.** Open a discussion. Tell us what is missing,
  what is confusing, what you expected to find and did not. We may well
  build it.

## Why code contributions are not merged

FOSSStudio is entirely Lightmorphic's own work (`NOTICE.md` sets out what
that means and lists the few third-party files). Because Lightmorphic
owns all of it, Lightmorphic can offer the same code under other terms,
which is how the hosted service that funds the work is possible. A
patch from someone else would belong to that person, so from the moment
it was merged that one sentence would stop being true for that patch.

That is the whole of it. It is not a judgment on anyone's code, and it
is not about quality. Please do not spend an evening on a pull request
for this project: pull requests will be closed with a link to this
file.

If you want to change FOSSStudio for your own use, fork it. The AGPL gives
you that right and you do not need our permission.

## Could that change?

Only one way, and not soon: a contributor agreement. A short document
signed once, saying the code is yours to give and that Lightmorphic may
use it under any license. Nothing gets merged before that exists,
because the alternative - taking patches under the AGPL alone - would
mean Lightmorphic could no longer offer the whole of FOSSStudio under
other terms, and that is what pays for it.

So there is no queue to join and nothing waiting on us. Please do not
hold a branch open hoping.

## If you send code anyway

Sometimes people paste a fix into a bug report, or send a patch by
email. We would rather that did not happen, but if you do send us code,
by sending it you agree to the following:

> You confirm the code is yours to give, that you wrote it, and that no
> employer or other party has a claim on it. You give Lightmorphic an
> unrestricted, permanent, worldwide, royalty-free right to use, modify
> and distribute that code, in any part of FOSSStudio, under any license,
> including in proprietary and commercial versions. You keep your own
> copyright and may use your code however you like elsewhere. You are
> not entitled to payment for it.

If you are not willing to grant that, do not send code. Send a bug
report describing the problem instead, and it will be just as useful.

*This is a plain-language statement of intent, not legal advice. If a
contribution ever matters enough to argue about, get a solicitor to
look at it.*

## The linter

There is an Oxlint setup at the root of the repository, with a small
vendored plugin under `tools/oxlint/anti-slop/` that looks for the
habits of machine-written code. It is a check on us; FOSSStudio itself
runs from `server/`, which has its own dependencies and is unaffected.

```bash
npm install     # only for the linter
npm run lint
```
