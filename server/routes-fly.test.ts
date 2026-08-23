import { describe, expect, it } from "vitest";

import { parseEnvironmentFile } from "./routes-fly.js";

describe("parseEnvironmentFile", () => {
  it("returns parsed values internally without accepting invalid names", () => {
    const variables = parseEnvironmentFile(`
# comment
API_KEY="secret value"
EMPTY=
INVALID-NAME=nope
PLAIN=value
`);
    expect([...variables.entries()]).toEqual([
      ["API_KEY", "secret value"],
      ["EMPTY", ""],
      ["PLAIN", "value"],
    ]);
  });
});
