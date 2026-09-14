# Changelog

All notable changes to FOSSStudio are documented here.

## 1.0.0 - 2026-09-14

**The number changes what the words mean.** Until today this said
beta, and beta meant: install it, break it, and do not put anything you
cannot lose on it. That warning is gone from the README, the website
and the runbook, because it is no longer the honest description. What
has not changed is the advice underneath it - record a test session
before a real one, and keep a second recording running for anything
that truly matters. That is not a beta rule; it is what anybody sane
does with any studio.

One thing is still unproven and is said here rather than left for
somebody to discover: the media path has only ever been exercised with
every browser on one machine. Two people in different houses is the
normal case and it should be fine - it is ordinary WebRTC through
mediasoup with a relay behind it - but nobody has watched it work.

**One question about formats, and the rest folded away.** The settings
used to offer one choice with two answers, and the picture was not a
choice at all. Now the first question is the only one most people have:
what should the finished video of everyone be - MP4 with H.264, or
WebM with VP8, VP9 or AV1. Then a plain yes or no: do you want a file
for each person as well. A new studio says no, so a recording is one
file; say yes and you pick what the tracks and cameras are, as many
formats at once as you like, each written at the same time as its own
file. The sizes are added up in front of you before the show - people,
hours, a line per format - because the moment to learn that a choice is
fifty gigabytes is not afterwards.

Every format offered is one a browser writes itself. There is no
encoder on the server and never will be, so the screen says which
browsers can write each one rather than presenting the list as a
judgment of ours. **Whoever hosts decides the video of everyone**: that
file is drawn and encoded in the host's browser and no guest's browser
touches it, so an MP4 needs the host on Chrome or Edge, and a host on
Firefox gets WebM however it is set. The recording says so beside the
file when that happens, and says whose browser fell short of anything
else that was asked for.

The sound formats stay two on purpose. A late joiner's track is padded
with silence so it lines up with everybody else's, done by copying
bytes rather than encoding them, and that works on raw samples and on
Opus packets and nothing else. Offering AAC would mean tracks that do
not line up - the fault the padding exists to prevent.

**MP4 rather than WebM, where the browser can write one.** The video
used to come back as a WebM box with H.264 inside it, a mix the WebM
format does not allow and some editors refuse outright.

**Two things were quietly missing from recordings.** The advertising
banner and the subscribe reminder both played on screen and reached no
recording at all: the mixer was looking for a name the page had stopped
using. And the text-only title block threw on every redraw, which took
the block and every name banner out of the video with it. Both are
fixed, and both are now checked by reading the actual recorded pixels
rather than by looking at the page.

**The ad banner is the size it is meant to be.** It was sized against
the browser window rather than the picture, so a 1200-wide banner
arrived about 400 wide with text nobody could read. It now takes the
same share of the video that the recording gives it.

**The logo and title block fits its words.** A short name beside a logo
sat at one end of a lane of empty background. The box wraps its
contents now, with the same margin either side whatever is in it, and
the recording draws it at the shape the screen shows.

**The green room preview starts the right way round.** It was mirrored
by default, so the picture flipped the moment you joined - a setting
that reads as a fault. The mirror button still turns it on and the
choice is still remembered.

**Saved is a tick, not a green box.** Confirmation appears at the card
that changed, with no background and nothing arriving from elsewhere on
the page.

**It is for meetings too, and the site now says so from the first
line.** A podcast and a meeting are the same thing until the end - a
link, people talking, a recording - and what differs is whether you
publish the files or keep them. The studio always did both; the website
only ever described the first, so anybody looking for a way to hold a
meeting on hardware they control read a page about episodes and left.
The headline, the opening paragraph, the feature descriptions, the
questions, the page title and description, `llms.txt` and the README's
opening all say both now, rather than carrying a meetings paragraph at
the bottom, which would have said the opposite. In the product, the
dashboard asks for an "Episode or meeting title" instead of an episode
title, renames a session rather than an episode, and heads the theme
logo "Logo"; the "Subscribe reminder" stays as it is, being genuinely a
podcast feature.

**The privacy claim is printed with its exceptions beside it.** A new
answer, "What leaves the server?", says there is no analytics, no
tracking, no crash reporting, no update check and no fetch to any
domain but your own - and then names the two things that do leave, each
only when you ask: desktop notifications traveling through your browser
maker's push service as every web notification does, and the optional
certificate block asking Let's Encrypt for a certificate. A promise with
a hole in it is worse than a modest one. `server/test/site-test.mjs`
holds the site to it: every page is opened and any request that leaves
the machine fails the run.

**Help is a tab in the dashboard, with pictures of the real screens.**
It was a page of its own: a column of prose about as wide as a phone,
reached from a button in the top right, opening with no menus around it.
It is now a pane like Sessions or Settings, at the foot of the left-hand
menu beside Account and System, in the same grid and the same width as
everything else. Each answer is two columns on a desktop - the prose at
a measure somebody can read, and beside it the thing that makes it
quicker to understand: a screenshot of the screen being talked about, a
table of the ports or the four ways to get a certificate, or the one
sentence in that answer that matters most. There is one new answer, on
what the buttons in the host panel do. The pictures are the product,
taken from a real studio by `server/test/help-shots.mjs` the same way
the website's are, and served from the studio itself, because a box with
no internet is the normal case here. `/help` still works as an address
and still lands on the right answer: `/help#public-ip`, which is what
the media warning in a live session points at, opens Help at "Why can
nobody hear anything?".

**The host panel speaks in icons.** Eleven word buttons down the side of
a live session become seven pictures on two rows - auto level, mute all,
the subscribe reminder, the ad banner, then banner colors, title color
and backdrop. Each says its name on hover and on keyboard focus, and
carries the same words as an aria-label so a screen reader is not handed
a blank button. Record keeps its word: it is the one button where a
mistake costs a whole show, it changes state in the middle of a take,
and it carries the elapsed clock. The paired choices - Random and Guests
choose, Color and Wallpaper - keep their words too, because a pair of
pictures says "two more buttons" rather than "one or the other". The
panel is 172 pixels wide instead of 200, because its width now follows
what has to fit rather than the longest label.

**American spelling throughout.** Every word a person reads - the
screens, the help page, the website, the README, this file, the code's
own comments - is now spelled the American way. Names in code are not:
the backdrop's `colour` key on the wire, the `programme` recording kind
in stored file names and the browser's own `AnalyserNode` keep their
spelling, because renaming those is a data change and does not belong in
a wording change. `server/test/spelling-test.mjs` keeps it that way, and
lists those exceptions one by one.

**Every track is the full length of the take.** A guest who joins five
minutes late used to hand you a track that started at zero along with
everybody else's, so every word in it sat five minutes early; a guest
who dropped out for ten seconds came back as a stranger and got a second
file, because a person was known by their connection and a connection is
new every time. Now a browser keeps an id for itself and the room and
presents it on every join, a reconnect continues the same take, and the
gaps are filled with silence at the end. One file per person, the full
length of the take, lining up in an editor with nothing to drag.

The silence is manufactured without an encoder, which is the only reason
it could be done at all: an uncompressed .webm holds the float samples
themselves, so silence is zeroes and the file is repackaged as a .wav,
and an Opus .webm holds whole Opus packets, so silence is the three-byte
packet the standard reserves for it and the file becomes an .ogg.
Nothing is decoded either way. The finished audio is therefore a .wav or
an .opus rather than a .webm, which is also what an editor wants:
Audacity opens both on its own and needs an extra library for anything
in a .webm.

The id is deliberately not taken from the session link - links get
shared, and two people on one link have to stay two people. Somebody
coming back on a different device, or on a browser whose site data was
cleared, is honestly a new person and gets a second track; the dashboard
says so beside it rather than leaving the host to wonder.

Cameras are the exception. A picture of nothing still has to be encoded
and there is no encoder here, so each stretch of camera keeps its own
file and is told where in the take it starts. The sound beside it is
still the full length.

**A recording quality setting.** Settings, Recording offers Best quality
- every sample as the microphone heard it, about 1.4 GB per person per
hour - or Smaller files, very good for speech at about 54 MB. It never
says a codec name, because the point is the thing most people have never
been told: a file ending .webm is a box, and the same box holds either
of those. Best quality is the default. The choice is pinned when a take
starts, so a setting changed halfway through cannot leave one person's
track in a different form from everybody else's. Firefox cannot record
uncompressed at all - said in one line beside the setting, and marked
beside any track it happened to.

**Setup happens in the studio, not in a compose file.** The domain, the
public address, the login and both secrets are gone from it; what is
left is the image, the ports and the volume, and the one-paste install
now has nothing in it to fill in. The studio makes its own secrets on
the first start and keeps them in its data folder, so nobody generates
one with openssl and nobody pastes one anywhere. The relay is a separate
container that cannot read the studio's settings, so the studio writes
the relay's config file for it - same secret, same public address, and
neither in a file anybody edits.

Claiming the studio is the first visitor's to do. Whoever opens it first
sets the password and it is theirs; after that the setup screen is gone
and the route behind it refuses everybody, from that machine as much as
from anywhere else. There is no code to find, on the screen or in the
log. This is how Jellyfin, Immich and Home Assistant all work, and what
it costs is a window between the container starting and somebody
claiming it, which the install notes, the README, the compose file's
first comment and the studio's own log all say out loud. For the install
that cannot afford that window - a port already open to the internet -
`REQUIRE_SETUP_CODE=1` puts the code back: printed in the log on every
start where nobody owns the studio, held in memory for the life of the
process, and written nowhere.

An earlier attempt at this asked for the code only when the browser was
somewhere other than the machine itself, which read well and delivered
nothing: in Docker the browser is outside the container, so the request
crosses Docker's network and is never loopback however close you are
sitting. Every documented install is Docker, so everybody still had a
code to find. The loopback code stays, because with `REQUIRE_SETUP_CODE`
on somebody sitting at the machine still should not have to read a log,
and because the address is taken from the socket and never from a header
- `X-Forwarded-For: 127.0.0.1` costs a stranger nothing.

The password rule is enforced rather than advised. Twelve characters,
and a check against the ones people actually choose, so password123 is
refused as "password" with numbers on the end rather than for being a
character short. No rules about capitals and symbols - they produce
Password1! and teach nobody anything. A passphrase is offered beside the
box and one click takes it, and every refusal says what would pass.

**Passkeys.** The browser or phone keeps the private key and the studio
stores only the public half, so a stolen data folder yields nothing that
can be used to log in, and there is no password to phish. Verified on
the server rather than taken on the browser's word: the challenge is the
one we issued, the domain is ours, and the signature checks out, ES256
or RS256. A passkey belongs to the domain it was made on, so moving the
studio kills it - which is why a strong password stays as the way back
in rather than disappearing. Two-factor is offered in the same minute as
the password, because nobody comes back to do it later.

An existing install keeps working and is never sent through setup.
HOST_PASSWORD left in somebody's compose file is still honored, and the
log says once where that belongs now.

**A help page inside the studio**, at /help, behind the login, with
nothing on it fetched from anywhere else - a self-hosted box may have no
internet, and a website describes whatever is current rather than what
somebody installed. Each section starts with the question a person is
actually asking. Why can nobody hear anything; what is really in the
file; which quality to choose; why HTTPS is not optional and the several
ways to get a certificate, Caddy being one of them rather than the way;
how much disk a show takes; how the first run claims the studio,
passkeys and what to do when locked out; what happens to a guest who joins late or drops out. Every
setting that needs explaining has a plain link straight to its own
section.

Two-factor still shows its secret as text and a link to an authenticator
app rather than a code to scan. A QR has to be drawn in the page -
sending the secret to a QR service is not an option - and there was no
way on this machine to prove a generated one actually scans. A picture
that might not work is worse than no picture.

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
their own machine, and that file is what you are given, exactly as it
was recorded: one .webm per person. In a Chromium-based browser such as
Chrome, Brave or Edge the audio inside it is uncompressed; other
browsers record Opus, which is far smaller. Alongside the separate
tracks comes one video of the whole show: while a take runs, the host's
browser paints the program onto a 1280x720 canvas, mixes every voice
and encodes it, so a finished file arrives rather than a job for the
server. Everything is in the dashboard when you stop, file by file or
as a zip.

Nothing on the server opens a recording. There is no media tool
installed in the image, no conversion step in the browser code either,
and no long-running child process anywhere in the product. The bill for
that honesty is disk: uncompressed audio runs to about 1.4 GB per
person per hour, so four people for two hours is over 11 GB. A long
show with a full room wants room to land, and it is said on the site
and in the README rather than discovered afterwards.

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

An install is one person's studio: one login, and no way to make a
second, because somebody who wants their own runs their own copy. The
password lives in the compose file and is read on every start, so
changing it there and restarting is all it takes - a first run that
went wrong cannot leave you locked out of your own studio. The login
can be locked with a second factor, and the dashboard can have a
domain of its own, certificate included.

The rest is the housekeeping a self-hosted thing needs. A guest who joins a shared link to abuse it can be blocked
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

The license is the GNU AGPL v3. The difference from the GPL is one
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
