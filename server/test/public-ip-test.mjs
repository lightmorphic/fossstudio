// The example config used to ship a documentation address that looks like
// a real one, and leaving it produced the worst failure this product has:
// the site loads, the room opens, guests appear in the list, and no sound
// or picture ever arrives, because every guest has been handed an address
// that reaches nobody.
//
// The address is a setting now rather than a line in a file, so refusing
// to start is no longer the right answer - that would lock somebody out of
// the very screen that fixes it. Instead the value is judged, refused, and
// the reason said plainly. These hold it to that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { publicIpProblem } from "../src/config.js";

test("refuses the three ranges reserved for documentation", () => {
  for (const ip of ["203.0.113.7", "192.0.2.1", "198.51.100.44"]) {
    const problem = publicIpProblem(ip);
    assert.ok(problem, `${ip} should have been refused`);
    // The message has to say what to do, not only what is wrong.
    assert.match(problem, /ipify|find/i, `${ip}: the message must say how to find the real one`);
  }
});

test("refuses something that is not an address at all", () => {
  assert.ok(publicIpProblem("your-servers-public-ip"));
  assert.ok(publicIpProblem("studio.example.com"));
});

test("accepts a real address", () => {
  assert.equal(publicIpProblem("88.97.12.4"), "");
  assert.equal(publicIpProblem("192.168.68.120"), "");
});

test("accepts nothing at all", () => {
  // Empty is legitimate: on a machine whose public address is on its own
  // interface the media engine works it out without being told.
  assert.equal(publicIpProblem(""), "");
  assert.equal(publicIpProblem(undefined), "");
});
