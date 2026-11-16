import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    appUpdateCommands,
    configCandidates,
    hostPlatform,
    loginCommands,
    parsePlatform,
    readBuildId,
    steamcmdArgs,
    writeConfig,
} from "../src/steamcmd.js";

describe("platform", () => {
    test("maps Node's platforms to SteamCMD's", () => {
        expect(hostPlatform("win32")).toBe("windows");
        expect(hostPlatform("linux")).toBe("linux");
        expect(hostPlatform("darwin")).toBe("macos");
        expect(() => hostPlatform("aix")).toThrow(/doesn't run on aix/);
    });

    test("defaults to the runner's platform", () => {
        expect(parsePlatform("")).toBe(hostPlatform());
        expect(parsePlatform(undefined)).toBe(hostPlatform());
    });

    test("accepts the three platforms, case-insensitively", () => {
        expect(parsePlatform("Windows")).toBe("windows");
        expect(parsePlatform(" linux ")).toBe("linux");
        expect(parsePlatform("macos")).toBe("macos");
        expect(() => parsePlatform("osx")).toThrow(/Invalid platform/);
    });
});

describe("loginCommands", () => {
    test("logs in anonymously by default", () => {
        expect(loginCommands({ username: "" })).toEqual([["login", "anonymous"]]);
        expect(loginCommands({ username: "anonymous" })).toEqual([["login", "anonymous"]]);
    });

    test("uses the saved session from a VDF", () => {
        expect(loginCommands({ username: "user", vdf: "Zm9v" })).toEqual([["login", "user"]]);
    });

    test("uses a password, with a Steam Guard code if given", () => {
        expect(loginCommands({ username: "user", password: "pw" })).toEqual([["login", "user", "pw"]]);
        expect(loginCommands({ username: "user", password: "pw", totp: "ABC12" })).toEqual([
            ["set_steam_guard_code", "ABC12"],
            ["login", "user", "pw"],
        ]);
    });

    test("needs a login method for a real account", () => {
        expect(() => loginCommands({ username: "user" })).toThrow(/No login method/);
        expect(() => loginCommands({ username: "user", totp: "ABC12" })).toThrow(/needs password/);
    });
});

describe("steamcmdArgs", () => {
    test("keeps every argument separate and never prompts", () => {
        expect(steamcmdArgs([["force_install_dir", "C:\\Program Files\\Game"], ["login", "user"]])).toEqual([
            "+@ShutdownOnFailedCommand", "1",
            "+@NoPromptForPassword", "1",
            "+force_install_dir", "C:\\Program Files\\Game",
            "+login", "user",
            "+quit",
        ]);
    });
});

describe("appUpdateCommands", () => {
    const base = { appid: "2868840", dir: "/games/sts2", platform: "windows" as const, login: [["login", "user"] as ["login", string]] };

    test("forces the platform and install folder before logging in", () => {
        expect(appUpdateCommands(base)).toEqual([
            ["@sSteamCmdForcePlatformType", "windows"],
            ["force_install_dir", "/games/sts2"],
            ["login", "user"],
            ["app_update", "2868840"],
        ]);
    });

    test("adds a beta branch, its password, and validation", () => {
        const commands = appUpdateCommands({ ...base, beta: "public-beta", betaPassword: "secret", validate: true });
        expect(commands.at(-1)).toEqual(["app_update", "2868840", "-beta", "public-beta", "-betapassword", "secret", "validate"]);
    });

    test("ignores a beta password without a beta", () => {
        expect(appUpdateCommands({ ...base, betaPassword: "secret" }).at(-1)).toEqual(["app_update", "2868840"]);
    });
});

describe("files", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), "steam-download-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    test("reads the installed build ID", async () => {
        await mkdir(path.join(dir, "steamapps"));
        await writeFile(path.join(dir, "steamapps", "appmanifest_2868840.acf"), '"AppState"\n{\n\t"appid"\t\t"2868840"\n\t"buildid"\t\t"26660232"\n}\n');
        expect(await readBuildId(dir, "2868840")).toBe("26660232");
        expect(await readBuildId(dir, "4000")).toBeUndefined();
    });

    test("looks for config.vdf next to SteamCMD first", () => {
        expect(configCandidates("/tools/steamcmd", "/home/runner")[0]).toBe(path.join("/tools/steamcmd", "config", "config.vdf"));
    });

    test("writes the decoded VDF where SteamCMD keeps its config", async () => {
        const steamcmdDir = path.join(dir, "steamcmd");
        await mkdir(path.join(steamcmdDir, "config"), { recursive: true });
        const file = await writeConfig(steamcmdDir, Buffer.from('"InstallConfigStore" {}').toString("base64"));
        expect(file).toBe(path.join(steamcmdDir, "config", "config.vdf"));
        expect(await readFile(file, "utf-8")).toBe('"InstallConfigStore" {}');
    });
});
