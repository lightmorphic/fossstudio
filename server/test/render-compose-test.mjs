// The block on the website is a picture of quickstart-compose.yml, and a
// picture goes stale. It did: the file learned to publish ports while the
// page still showed host networking, so everybody pasting from the site
// got the old stack and no ports. This holds the two together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

test("the website's compose block is the compose file", () => {
  const r = spawnSync("python3", [path.join(root, "scripts", "render-compose.py"), "--check"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
