// One account, and no way to make another. This is the test that would
// catch a second account creeping back in: the screen, the route and
// the API that used to make one are all gone, the dashboard is one page
// behind one login, and a guest still gets in on a link with no account
// at all - which is the thing that must never be confused with one.
import { STUDIO, apiLogin } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || STUDIO.password;
let pass = true;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  pass &&= ok;
};

const cookie = await apiLogin(B, PW);
const signedIn = (p, opts = {}) => fetch(`${B}${p}`, {
  redirect: "manual",
  ...opts,
  headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) }
});

// The account, and only the account
const me = await (await signedIn("/api/me")).json();
check(`signed in as the studio account (${me.username})`, me.authed === true && !!me.username);
check("nothing in /api/me hints at a role", !("role" in me) && !("uid" in me));

// Every road to a second account
for (const [label, path, opts] of [
  ["listing accounts", "/api/users", {}],
  ["creating an account", "/api/users", { method: "POST", body: JSON.stringify({ username: "second", password: "averylongpassword" }) }],
  ["inviting somebody", "/api/users/invite", { method: "POST", body: JSON.stringify({ username: "second" }) }],
  ["reading an invite", "/api/invite/anything", {}],
  ["accepting an invite", "/api/invite/accept", { method: "POST", body: JSON.stringify({ token: "x", password: "averylongpassword" }) }],
  ["the invite page", "/host/invite.html", {}],
  ["the second panel", "/admin/", {}]
]) {
  const res = await signedIn(path, opts);
  check(`${label} is not a thing (${res.status})`, res.status === 404);
}

// The sign-up itself, which happens once in the life of an install.
// There is no setup code any more (see setup-test) - the first visitor
// claims the studio - and this is the half of that which must never
// move: having nothing to prove is not a way to sign up again. From
// this machine, with no cookie at all, the screen is a 404 and the
// route behind it refuses.
for (const [label, path, opts, want] of [
  ["the setup screen", "/host/setup.html", {}, 404],
  ["claiming it again", "/api/setup/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "second", password: "plum-lantern-vault-drift-onyx" })
  }, 409]
]) {
  const res = await fetch(`${B}${path}`, { redirect: "manual", ...opts });
  check(`${label} is refused on a claimed studio, from this machine (${res.status})`,
    res.status === want);
}
const claimed = await (await fetch(`${B}/api/setup/state`)).json();
check("and it still says it has an owner", claimed.claimed === true);

// And the account file is still one account afterwards
const before = await (await signedIn("/api/me")).json();
check("still the same one account", before.username === me.username);

// The dashboard is one page: every menu it offers is open to whoever
// signed in, and there is no hole where a screen used to be.
const page = await (await signedIn("/host/")).text();
check("the dashboard has no Hosts screen", !/Manage hosts|Invite a host/.test(page));
check("the dashboard keeps System", /Recent log/.test(page) && /Backups/.test(page));

// The thing that must survive: a guest joins by link, with no account.
const session = await (await signedIn("/api/sessions", {
  method: "POST", body: JSON.stringify({ title: "Guests still get in" })
})).json();
const guest = await fetch(`${B}/s/${session.id}`);
check(`a guest link opens with no login at all (${guest.status})`, guest.ok);

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
process.exit(pass ? 0 : 1);
