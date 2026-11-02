// Phone admin guards (402px audit, 2026-11-01): platform screens keep a 12px text floor and use the
// popover select/date/time fields instead of native controls. Static source scan; no DB or network.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
function files(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(rel);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}
// features/dashboard is shared byte-for-byte with E-commerce; store-settings is owned by the logo fleet work.
const admin = files("features/platform").filter((file) => !file.includes("/store-settings/"));
const offenders = (pattern: RegExp, allow: string[] = []) => admin.filter((file) => !allow.includes(file))
  .flatMap((file) => fs.readFileSync(path.join(root, file), "utf8").split("\n")
    .flatMap((line, i) => (pattern.test(line) && !/^\s*(\/?\*|\/\/)/.test(line) ? [`${file}:${i + 1}`] : [])));

test("admin text never drops below 12px", () => {
  assert.deepEqual(offenders(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/), []);
});

test("platform screens use popover selects, not native <select>", () => {
  assert.deepEqual(offenders(/<select\b/).filter((hit) => hit.startsWith("features/platform")), []);
});

test("platform screens use the calendar and time popovers, not native date/time inputs", () => {
  assert.deepEqual(offenders(/type=["'](?:date|time|datetime-local)["']/).filter((hit) => hit.startsWith("features/platform")), []);
});
