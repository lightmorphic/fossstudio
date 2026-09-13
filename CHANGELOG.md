# Changelog

All notable changes to FOSSStudio are documented here.

## 0.1.0 - 2026-09-13

The first release, and the number says what it is: a beta.

**This is a public beta. It is not ready to be relied on. Data loss and
breaking changes are possible. Please do not put a real show on it
yet.** The README says so above everything else, and releases are
marked as pre-release on GitHub.

FOSSStudio is a self-hosted video podcast studio. You put one Docker
Compose file on a server you control, point a domain at it, and you
have a studio: send a guest a link, they land on a preview screen,
pick their camera and microphone and join in a browser with no account
and nothing to install. The room holds ten people, plus up to four
view-only connections.

The host runs the session from a panel on the same page. Spotlight
someone or go back to the grid; set anybody's volume or let the
automatic level balancing even out the quiet and the loud; mute one
person or everybody; lower a raised hand; change the backdrop between
segments; put a subscribe reminder or your own advertising banner on
screen. Everything the host does is what the recording shows, at the
moment it was done.

Recording is the point of it, and the whole of it happens in the
browsers taking part. Each person is recorded on their own track, on
their own machine - uncompressed where the browser can do that, which
Chromium-based browsers such as Chrome, Brave and Edge can, and in Opus
where it cannot - and that file is
what you are given, exactly as it was recorded. Alongside the separate
tracks comes one video of the whole show: while a take runs, the host's
browser paints the programme onto a 1280x720 canvas, mixes every voice
and encodes it, so a finished file arrives rather than a job for the
server. Everything is in the dashboard when you stop, file by file or
as a zip.

Nothing on the server opens a recording. There is no media tool
installed in the image, no conversion step in the browser code either,
and no long-running child process anywhere in the product. The bill for
that honesty is disk: uncompressed audio runs to about 1.4 GB per
person per hour, so a long show with a full room wants room to land.

The video of everyone is the picture people were on. Tile sizes,
spacing and corners come from one set of frame-relative fractions that
the page and the mixer share, and a test holds the two in step. The
lower-third name banners, the podcast logo and the episode title block
are in it too - the host drags that block anywhere, resizes it, and
right-clicks it for the rest. The theme is pinned the moment the first
person joins, so a settings change mid-show cannot alter what anybody
sees.

Every session also has a view-only output link with no join screen and
no controls. It works as a browser source in OBS, which is how a host
who wants to broadcast does it, and it can never appear in the
recording or be seen by anyone in the session.

One click sends a finished recording to your own FOSSCast instance as
a draft episode. FOSSCast is a separate self-hosted app that publishes
a podcast; neither needs the other to run.

The rest is the housekeeping a self-hosted thing needs. Admins invite
hosts with a link and each host chooses their own password; either
panel can be locked with a second factor; the admin and host panels
are separate sessions on optional separate domains, certificates
included. A guest who joins a shared link to abuse it can be blocked
from every session on the server, reversibly, with the block logged
and the address never reaching a browser. Settings and session history
are backed up daily and restorable from the dashboard, and the whole
data folder downloads as one archive. Noise suppression is RNNoise in
the guest's own browser. The dashboard can ask for permission to nudge
you when a guest joins or a recording is ready, and asks for nothing
if you do not.

Nothing on any page is fetched from another domain: the typeface, the
scripts and the WebAssembly all come from your own server. There is no
account with us, no relay we run, and no limit we could lift.

The licence is the GNU AGPL v3. The difference from the GPL is one
clause: the GPL asks for changes to be shared when the software is
handed to someone, the AGPL asks for them when it is run for someone
over a network as well. This is the free edition of a hosted service,
so that is the case that matters. Nothing changes for anyone who runs
it for themselves. `TRADEMARKS.md` sits beside it: the code is free,
the names are not.

`NOTICE.md` sets out who wrote what, so the ownership claim can be
checked rather than taken on trust. Every line of FOSSStudio is
Lightmorphic's own work. The third-party material is listed file by
file: mediasoup-client (ISC), RNNoise through `@jitsi/rnnoise-wasm`
(Apache-2.0 over Xiph's BSD-3-Clause, with Emscripten's MIT glue) and
the Manrope typeface (SIL OFL 1.1). Four runtime npm dependencies, all
permissive but `web-push`, which is MPL-2.0 and used unchanged.

`CONTRIBUTING.md` explains what happens to a patch. Bug reports and
discussion are wanted; code is not merged during the beta, because one
person owning all of it is what makes the hosted edition possible, and
a patch from a stranger would end that for the patch. Afterwards it is
either a contributor agreement or contributions under the AGPL with
the relicensing right given up. That has not been decided.
