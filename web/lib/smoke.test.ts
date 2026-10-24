import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("test runner", () => {
  it("runs", () => expect(cn("a", "b")).toBe("a b"));
});
