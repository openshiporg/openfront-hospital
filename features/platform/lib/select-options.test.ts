import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { optionsFromChildren } from "./select-options";

const h = React.createElement;

test("a disabled empty option is the placeholder, not a choice", () => {
  const result = optionsFromChildren([
    h("option", { key: "p", value: "", disabled: true }, "Select customer"),
    h("option", { key: "a", value: "u1" }, "Ada", " · ", "ada@example.com"),
  ]);
  assert.equal(result.placeholder, "Select customer");
  assert.deepEqual(result.options, [{ value: "u1", label: "Ada · ada@example.com" }]);
});

test("an enabled empty option stays selectable", () => {
  const { options, placeholder } = optionsFromChildren([h("option", { key: "n", value: "" }, "Unassigned"), h("option", { key: "s", value: "s1" }, "Sam")]);
  assert.equal(placeholder, undefined);
  assert.deepEqual(options.map((o) => o.value), ["", "s1"]);
});

test("fragments and mapped arrays flatten in order", () => {
  const { options } = optionsFromChildren(h(React.Fragment, null, h("option", { value: "cash" }, "Cash"), [h("option", { key: 1, value: "trade" }, "Trade")]));
  assert.deepEqual(options.map((o) => o.label), ["Cash", "Trade"]);
});

test("optgroups flatten with their label and numeric values become strings", () => {
  const { options } = optionsFromChildren([
    h("optgroup", { key: "g", label: "Mon Nov 2" }, h("option", { value: "2026-11-02T14:00:00Z" }, "9:00 AM")),
    h("option", { key: "n", value: 3 }, "Wed"),
  ]);
  assert.deepEqual(options, [{ value: "2026-11-02T14:00:00Z", label: "Mon Nov 2 · 9:00 AM" }, { value: "3", label: "Wed" }]);
});
