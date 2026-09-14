// The old single quality setting, carried forward.
//
// A studio that had chosen the small files must not wake up writing
// uncompressed audio: that is twenty-four times the disk, decided for
// somebody rather than by them. This is checked because the first
// attempt at it silently did nothing - it asked the merged settings
// whether they had a format list, and the defaults had already put one
// there, so the answer was always yes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// One child per case. The data directory is read once when the config
// module loads, so two cases in one process would both land in the
// first one's folder - which is exactly what happened, and the second
// case passed by looking at a file the first case had written.
const CHILD = process.argv[2];
if (CHILD) {
  process.env.DATA_DIR = CHILD;
  const { migrateSettings, getSettings } = await import("../src/settings.js");
  await migrateSettings();
  process.stdout.write(JSON.stringify(await getSettings()));
  process.exit(0);
}

let pass = true;
const check = (l, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${l}`); pass &&= ok; };

for (const [was, wanted] of [["smaller", "opus"], ["best", "wav"]]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fossstudio-migrate-"));
  fs.writeFileSync(path.join(dir, "settings.json"),
    JSON.stringify({ recordingQuality: was, exampleAdOffered: true }), { mode: 0o600 });
  const run = spawnSync(process.execPath, [new URL(import.meta.url).pathname, dir],
    { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`migration child failed: ${run.stderr}`);
  const after = JSON.parse(run.stdout);
  check(`"${was}" becomes ${wanted} (${(after.audioFormats || []).join(", ")})`,
    (after.audioFormats || []).join() === wanted);
  check(`"${was}" gets a video of everyone too (${after.showFormat})`, after.showFormat === "mp4");
  check(`"${was}" keeps the separate files, which is what it had`, after.separateFiles === true);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  check(`"${was}" is written down, not worked out again every start`,
    Array.isArray(onDisk.audioFormats));
  check(`"${was}": the dead setting is not handed back out`, after.recordingQuality === undefined);
  fs.rmSync(dir, { recursive: true, force: true });
}
// The one list for both the show and the cameras, which existed for
// about an hour between two commits. Anybody who pulled in that window
// has it on disk, so it is carried forward rather than ignored.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fossstudio-migrate-"));
  fs.writeFileSync(path.join(dir, "settings.json"),
    JSON.stringify({ audioFormats: ["opus"], videoFormats: ["vp9", "mp4"], exampleAdOffered: true }),
    { mode: 0o600 });
  const run = spawnSync(process.execPath, [new URL(import.meta.url).pathname, dir], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`migration child failed: ${run.stderr}`);
  const after = JSON.parse(run.stdout);
  check(`one picture list becomes the show (${after.showFormat})`, after.showFormat === "vp9");
  check(`one picture list becomes the cameras (${(after.cameraFormats || []).join(", ")})`,
    (after.cameraFormats || []).join() === "vp9,mp4");
  check("the sound choice is left alone", (after.audioFormats || []).join() === "opus");
  check("the dead list is not handed back out", after.videoFormats === undefined);
  fs.rmSync(dir, { recursive: true, force: true });
}

// A studio with nothing stored at all is a new one, and a new one gets
// the simple answer: the video of everyone and nothing else.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fossstudio-migrate-"));
  const run = spawnSync(process.execPath, [new URL(import.meta.url).pathname, dir], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`migration child failed: ${run.stderr}`);
  const after = JSON.parse(run.stdout);
  check("a brand new studio keeps only the video of everyone", after.separateFiles === false);
  check(`and it is an MP4 (${after.showFormat})`, after.showFormat === "mp4");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
process.exit(pass ? 0 : 1);
