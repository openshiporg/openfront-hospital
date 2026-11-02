import { test } from "node:test";
import assert from "node:assert/strict";
import { dateKey, formatClock, formatDateKey, parseDateKey, splitLocalDateTime, timeOptions } from "./date-fields";

test("date keys round-trip and reject impossible days", () => {
  assert.equal(dateKey(parseDateKey("2026-11-04")!), "2026-11-04");
  assert.equal(parseDateKey("2026-02-30"), null);
  assert.equal(parseDateKey(""), null);
  assert.equal(formatDateKey("2026-11-04"), "Nov 4, 2026");
});

test("clock labels are 12-hour", () => {
  assert.equal(formatClock("00:00"), "12:00 AM");
  assert.equal(formatClock("07:05"), "7:05 AM");
  assert.equal(formatClock("12:30"), "12:30 PM");
  assert.equal(formatClock("23:45"), "11:45 PM");
});

test("time options cover the day and keep an off-step saved value", () => {
  const quarter = timeOptions(15);
  assert.equal(quarter.length, 96);
  assert.deepEqual(quarter[0], { value: "00:00", label: "12:00 AM" });
  const kept = timeOptions(15, "07:10").map((option) => option.value);
  assert.ok(kept.includes("07:10"));
  assert.deepEqual(kept.slice(28, 31), ["07:00", "07:10", "07:15"]);
});

test("datetime-local strings split into date and time", () => {
  assert.deepEqual(splitLocalDateTime("2026-11-04T07:30"), { date: "2026-11-04", time: "07:30" });
  assert.deepEqual(splitLocalDateTime("2026-11-04"), { date: "2026-11-04", time: "" });
  assert.deepEqual(splitLocalDateTime(""), { date: "", time: "" });
});
