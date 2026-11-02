import { test } from "node:test";
import assert from "node:assert/strict";
import { countOf, plural, singularOf } from "./plural";

test("singular only at exactly one", () => {
  assert.equal(plural(1, "item"), "1 item");
  assert.equal(plural(0, "item"), "0 items");
  assert.equal(plural(2, "variant"), "2 variants");
  assert.equal(plural(1, "currency", "currencies"), "1 currency");
  assert.equal(plural(3, "currency", "currencies"), "3 currencies");
});

test("list pager nouns singularize", () => {
  for (const [many, one] of [["schedules", "schedule"], ["event types", "event type"], ["deliveries", "delivery"], ["attendee records", "attendee record"], ["routing forms", "routing form"], ["embeds", "embed"]]) {
    assert.equal(singularOf(many), one);
  }
  assert.equal(countOf(1, "bookings"), "1 booking");
  assert.equal(countOf(4, "bookings"), "4 bookings");
  assert.equal(countOf(1, "deliveries"), "1 delivery");
});
