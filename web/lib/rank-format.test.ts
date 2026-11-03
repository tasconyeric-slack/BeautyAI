import { expect, it } from "vitest";
import { formatTopPercent } from "./rank-format";

it.each([[12.4, "12.4"], [4.7, "4.7"], [.86, "0.86"], [.13, "0.13"], [.008, "0.008"]])("formats %s without losing tail precision", (n, expected) => {
  expect(formatTopPercent(n as number)).toBe(expected);
});
it("never rounds a positive tail to zero", () => {
  expect(formatTopPercent(1e-18)).toBe("1.00e-18");
});
