/** 密钥脱敏和文件权限是本地 BFF 的核心安全回归测试。 */
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigStore, secretState } from "./config-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("ConfigStore", () => {
  it("returns only configured state and fingerprint for stored secrets", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "starcat-admin-test-"));
    temporaryDirectories.push(directory);
    const store = new ConfigStore(directory);

    const state = await store.updateServiceSecret(
      "production",
      "weekly",
      "adminKey",
      "weekly-secret-value",
    );
    const publicConfig = await store.publicConfig();
    const persisted = await readFile(
      path.join(directory, "secrets.json"),
      "utf8",
    );

    expect(state).toEqual({
      configured: true,
      fingerprint: expect.stringMatching(/^[A-F0-9]{8}$/),
    });
    expect(publicConfig.secrets.profiles.production.weekly.adminKey).toEqual(
      state,
    );
    expect(Object.keys(publicConfig.profiles.production.services)).toEqual([
      "sharing",
      "trending",
      "weekly",
      "wiki",
      "recommend",
      "discovery",
    ]);
    expect(JSON.stringify(publicConfig)).not.toContain("weekly-secret-value");
    expect(persisted).toContain("weekly-secret-value");
    expect(
      (await stat(path.join(directory, "secrets.json"))).mode & 0o777,
    ).toBe(0o600);
  });

  it("removes a secret when an empty replacement is saved", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "starcat-admin-test-"));
    temporaryDirectories.push(directory);
    const store = new ConfigStore(directory);
    await store.updateGlobalSecret("githubToken", "token");
    await store.updateGlobalSecret("githubToken", "  ");
    expect((await store.publicConfig()).secrets.githubToken).toEqual({
      configured: false,
    });
  });

  it("drops unknown service entries left by an older local config", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "starcat-admin-test-"));
    temporaryDirectories.push(directory);
    const store = new ConfigStore(directory);
    const config = await store.loadConfig();
    const legacy = structuredClone(config) as typeof config & {
      profiles: typeof config.profiles & {
        test: typeof config.profiles.test & {
          services: typeof config.profiles.test.services & {
            closed_service: { baseURL: string };
          };
        };
      };
    };
    legacy.profiles.test.services.closed_service = {
      baseURL: "https://closed.example.invalid",
    };
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "config.json"),
      JSON.stringify(legacy),
      "utf8",
    );

    expect(await store.loadConfig()).not.toHaveProperty(
      "profiles.test.services.closed_service",
    );
  });
});

describe("secretState", () => {
  it("does not expose empty or original values", () => {
    expect(secretState()).toEqual({ configured: false });
    expect(secretState("secret")).toEqual({
      configured: true,
      fingerprint: expect.any(String),
    });
  });
});
