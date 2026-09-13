// The example config has to show the shape of a public IP, and someone
// will always start the studio without changing it. That failure is
// silent - the room opens and nobody can hear anybody - so config.js
// refuses to start instead. These hold it to that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configPath = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "src",
  "config.js",
);

function start(publicIp) {
  return spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(configPath)});`],
    {
      encoding: "utf8",
      env: { ...process.env, PUBLIC_IP: publicIp, SESSION_SECRET: "x", TURN_SECRET: "x" },
    },
  );
}

test("refuses the documentation address the example ships with", () => {
  const r = start("203.0.113.7");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /still the example value/);
  // The message has to say what to do, not only what is wrong.
  assert.match(r.stderr, /api\.ipify\.org/);
});

test("refuses the other two documentation ranges", () => {
  for (const ip of ["192.0.2.1", "198.51.100.44"]) {
    assert.equal(start(ip).status, 1, `${ip} should have been refused`);
  }
});

test("refuses anything that is not an address at all", () => {
  assert.equal(start("your-servers-public-ip").status, 1);
});

test("accepts a real address, and an empty one", () => {
  assert.equal(start("88.97.12.4").status, 0);
  // Empty is legitimate: on a machine whose public address is on its own
  // interface the media engine works it out without being told.
  assert.equal(start("").status, 0);
});
