# fossstudio.org: go-live pass, 7 September 2026

Everything below was found by checking, not by reading. Where a claim on
the page said something about the software, the code that proves it was
found first.

## The four required checks

| Check | Result |
|---|---|
| access-check | Ran. One blocking failure, fixed. Everything else passed. |
| responsive-sweep | Ran. Two faults, both fixed. Clean at every width from 1440 down to 320. |
| vitals-ready | Ran. Four gaps, all filled. |
| lightmorphic-style | Ran. Two failures fixed, one departure declared below. |

## What was actually wrong

**Five screenshots showed software that no longer exists.** They were
taken on 22 August. Since then the control bar gained screen sharing, the
guest name cards were slimmed, and the waiting room was redesigned three
times. All five are regenerated from a real session.

**The real cause, which mattered more than the pictures:** the script
made PNG files, the site uses JPGs, and the conversion was a manual step
somebody had to remember. Two of the five were not in the script at all —
they came from a separate script that had since been lost. Everything is
in one script now, conversion included, so one command produces exactly
what the site serves.

**The company's own link went nowhere.** The badge in the footer, and the
company address in the structured data, pointed at lightmorphic.co.uk.
That domain has no DNS record at all. It is lightmorphic.com now, checked.
The same dead domain appears in three files in the FOSSCast repo and four
in Portal — noted, not touched.

**Light mode failed the contrast rule.** The brand yellow reads at 2.08:1
on the pale background, where 4.5:1 is required, and every body link on
every page was drawn in it. Charlie's decision was to remove light mode
entirely rather than muddy the yellow. Dark only now; the switch, its
stored setting and every reference are gone. A side effect worth having:
the site now stores nothing on anybody's device at all.

**Eyebrow text on all seven pages.** Removed, along with its styling.

**The front page claimed a date it did not have.** It said 31 August; it
changed on 2 September. Every page now carries the date it really changed,
with a note beside it saying to update it by hand, because GitHub Pages
has no build step to generate one.

**Email addresses.** They were @fossstudio.org; the house rule is
privacy@, terms@ and complaints@lightmorphic.com, only on the five legal
pages. One was in the sub-footer and one in the structured data — both
gone from there. Terms had no way to get in touch at all and now names
terms@lightmorphic.com.

**The header pushed the page sideways below 665px**, because the six nav
links stopped fitting beside the wordmark and nothing collapsed them. It
wraps now. **The FAQ grid did the same below 340px** — a hard 320px
minimum on a track that was never allowed to shrink.

**The sticky header was frosted glass.** The house style forbids
translucency and backdrop blur outright. It is solid, which also spares a
repaint on every scroll frame.

**The spotlight tab said MARCO** while the picture showed Dev, and the
description read out to a screen reader described the grid whichever of
the three pictures was on screen. Both follow the picture now.

## Claims checked against the code

Each of these was traced to the thing that implements it:

- six backdrop layouts generated from a logo — seven styles exist, one of
  which is the flat colour the page names separately, so six is right
- up to ten people on screen, with OBS viewers in a separate pool
- lossless FLAC per person, mediasoup, RNNoise, TURN relay, screen sharing
- no database — no database dependency of any kind
- about 2-3 seconds to the audience — one-second HLS segments
- "no CDNs, no trackers, no external calls" — nothing in the app reaches
  outside, and the font is local
- GPL-3.0 on the page matches the LICENSE file
- the ports the install tells you to open are the ports the code uses

## The install instructions

The compose file was lifted off the page as a visitor would copy it, and
it parses. The repository it builds from answers, the Dockerfile it names
exists, and both images it pulls exist on Docker Hub.

**It was not run.** There is no Docker on this machine, and the file wants
ports 80 and 443 and a public address. That is the one thing in this pass
taken on inspection rather than execution, and it is worth someone running
it on a fresh server before it is called proven.

## Numbers

LCP 100ms against a target of 2500. CLS 0.0016 against 0.1. Nothing
render-blocking in the head, one 24KB variable font, every image sized.

## Declared departure from the house style

The style says light and dark should both work. This site is dark only,
which is Charlie's decision of 7 September, taken with the contrast
numbers in front of him.

## What this pass cannot tell you

An automated accessibility check finds roughly half of real problems.
Nothing obvious is broken, and that is not the same as compliant. Thirty
minutes with a keyboard and a screen reader would still be worth it.
