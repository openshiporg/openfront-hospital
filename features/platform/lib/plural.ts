/** "1 item", "2 items", "0 items"; pass the plural when it is not just word + "s". */
export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Singular of a plural English noun phrase ("event types" -> "event type", "deliveries" -> "delivery"). */
export function singularOf(noun: string) {
  if (/ies$/.test(noun)) return noun.replace(/ies$/, "y");
  if (/(ss|us)$/.test(noun)) return noun;
  return noun.replace(/s$/, "");
}

/** Count with a plural noun phrase as the source: countOf(1, "schedules") -> "1 schedule". */
export function countOf(count: number, pluralNoun: string) {
  return plural(count, singularOf(pluralNoun), pluralNoun);
}
