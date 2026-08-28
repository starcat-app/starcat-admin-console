/** Awesome 管理路由的来源解析模式请求契约测试。 */
import { describe, expect, it } from "vitest";

import { awesomeSourceSchema } from "./routes-awesome.js";

const baseSource = {
  id: "awesome-test",
  repo_full_name: "acme/awesome-test",
  display_name: "Awesome Test",
  image_url: "",
  summary_zh: "",
  summary_en: "",
  featured: false,
  sort_order: 1,
};

describe("awesomeSourceSchema", () => {
  it.each(["generic", "external_catalog", "repository_resources"])(
    "accepts the supported parser profile %s",
    (parserProfile) => {
      expect(
        awesomeSourceSchema.parse({
          ...baseSource,
          parser_profile: parserProfile,
        }).parser_profile,
      ).toBe(parserProfile);
    },
  );

  it("rejects an unknown parser profile", () => {
    expect(() =>
      awesomeSourceSchema.parse({
        ...baseSource,
        parser_profile: "repository-name-special-case",
      }),
    ).toThrow();
  });
});
