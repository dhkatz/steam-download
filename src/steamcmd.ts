import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type Platform = "windows" | "linux" | "macos";

const PLATFORMS: readonly Platform[] = ["windows", "linux", "macos"];

/**
 * The platform this runner is, in SteamCMD's terms.
 */
export function hostPlatform(nodePlatform: NodeJS.Platform = process.platform): Platform {
    switch (nodePlatform) {
        case "win32": return "windows";
        case "darwin": return "macos";
        case "linux": return "linux";
    }
    throw new Error(`SteamCMD doesn't run on ${nodePlatform}.`);
}

/**
 * Parse the platform input. Empty means the runner's own platform.
 */
export function parsePlatform(input: string | undefined): Platform {
    const value = input?.trim().toLowerCase();
    if (!value) {
        return hostPlatform();
    }
    if ((PLATFORMS as readonly string[]).includes(value)) {
        return value as Platform;
    }
    throw new Error(`Invalid platform "${input}". Use one of: ${PLATFORMS.join(", ")}.`);
}

const INSTALLERS: Record<Platform, { url: string, executable: string }> = {
    windows: { url: "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip", executable: "steamcmd.exe" },
    linux: { url: "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz", executable: "steamcmd.sh" },
    macos: { url: "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz", executable: "steamcmd.sh" },
};

async function exists(file: string): Promise<boolean> {
    return access(file).then(() => true, () => false);
}

/**
 * Run a program, streaming its output. Resolves with the exit code.
 */
export function exec(file: string, args: string[]): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(file, args, { stdio: "inherit" });
        child.on("error", reject);
        child.on("exit", (code) => resolve(code ?? 1));
    });
}

/**
 * Download SteamCMD into `dir` (once) and return the path to run it with.
 */
export async function install(dir: string): Promise<string> {
    const { url, executable } = INSTALLERS[hostPlatform()];
    const file = path.join(dir, executable);
    if (await exists(file)) {
        return file;
    }

    await mkdir(dir, { recursive: true });
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Downloading SteamCMD failed: HTTP ${response.status} from ${url}`);
    }
    const archive = path.join(dir, path.basename(new URL(url).pathname));
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));

    // Every runner has a tar that reads its own SteamCMD archive: Windows' bsdtar reads zip files.
    // (On Windows, "tar" on PATH may be Git's GNU tar, which can't, so use the system one.)
    const tar = process.platform === "win32"
        ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
        : "tar";
    const code = await exec(tar, ["-xf", archive, "-C", dir]);
    if (code !== 0 || !await exists(file)) {
        throw new Error(`Extracting SteamCMD failed (tar exited with ${code}).`);
    }
    return file;
}

/**
 * A SteamCMD command and its arguments, e.g. ["login", "anonymous"].
 */
export type Command = [string, ...string[]];

/**
 * Turn commands into SteamCMD's arguments. Each argument stays separate, so values with spaces survive.
 * SteamCMD stops at the first failed command, and never waits for a password or Steam Guard prompt.
 */
export function steamcmdArgs(commands: Command[]): string[] {
    return [
        "+@ShutdownOnFailedCommand", "1",
        "+@NoPromptForPassword", "1",
        ...commands.flatMap(([command, ...args]) => [`+${command}`, ...args]),
        "+quit",
    ];
}

/**
 * Exit codes SteamCMD finishes successfully with. It sometimes exits with 7 after updating itself.
 */
const SUCCESS = new Set([0, 7]);

export async function run(steamcmd: string, commands: Command[]): Promise<void> {
    const code = await exec(steamcmd, steamcmdArgs(commands));
    if (!SUCCESS.has(code)) {
        throw new Error(`SteamCMD failed with exit code ${code}. See its output above.`);
    }
}

export interface Credentials {
    username: string;
    password?: string;
    totp?: string;
    /** Base64 of SteamCMD's config/config.vdf after logging in once. */
    vdf?: string;
}

/**
 * The SteamCMD commands that log in.
 */
export function loginCommands({ username, password, totp, vdf }: Credentials): Command[] {
    if (!username || username === "anonymous") {
        return [["login", "anonymous"]];
    }
    if (totp) {
        if (!password) {
            throw new Error("totp needs password too.");
        }
        return [["set_steam_guard_code", totp], ["login", username, password]];
    }
    if (password) {
        return [["login", username, password]];
    }
    if (vdf) {
        // The saved session in config.vdf logs in without a password.
        return [["login", username]];
    }
    throw new Error("No login method: pass vdf (recommended), password, or password and totp. Free apps can use username: anonymous.");
}

/**
 * Where SteamCMD keeps config.vdf. On Windows it's next to steamcmd.exe; on Linux and macOS SteamCMD uses a
 * Steam folder in the home directory, created on its first run.
 */
export function configCandidates(steamcmdDir: string, home = os.homedir()): string[] {
    return [
        path.join(steamcmdDir, "config", "config.vdf"),
        path.join(home, "Steam", "config", "config.vdf"),
        path.join(home, ".steam", "steam", "config", "config.vdf"),
        path.join(home, ".local", "share", "Steam", "config", "config.vdf"),
        path.join(home, "Library", "Application Support", "Steam", "config", "config.vdf"),
    ];
}

/**
 * Write the saved login where SteamCMD reads it. Run SteamCMD once first, so its config folder exists.
 * @returns The file written.
 */
export async function writeConfig(steamcmdDir: string, vdf: string): Promise<string> {
    const candidates = configCandidates(steamcmdDir);
    let target = candidates[0];
    for (const candidate of candidates) {
        if (await exists(path.dirname(candidate))) {
            target = candidate;
            break;
        }
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(vdf, "base64"));
    return target;
}

/**
 * The SteamCMD commands that download (or update) an app into `dir`.
 */
export function appUpdateCommands(options: {
    appid: string,
    dir: string,
    platform: Platform,
    login: Command[],
    beta?: string,
    betaPassword?: string,
    validate?: boolean,
}): Command[] {
    const update: Command = ["app_update", options.appid];
    if (options.beta) {
        update.push("-beta", options.beta);
        if (options.betaPassword) {
            update.push("-betapassword", options.betaPassword);
        }
    }
    if (options.validate) {
        update.push("validate");
    }

    return [
        ["@sSteamCmdForcePlatformType", options.platform],
        // Must come before login.
        ["force_install_dir", options.dir],
        ...options.login,
        update,
    ];
}

/**
 * The build ID SteamCMD installed, from <dir>/steamapps/appmanifest_<appid>.acf.
 */
export async function readBuildId(dir: string, appid: string): Promise<string | undefined> {
    const manifest = path.join(dir, "steamapps", `appmanifest_${appid}.acf`);
    const text = await readFile(manifest, "utf-8").catch(() => undefined);
    return text === undefined ? undefined : /"buildid"\s+"(\d+)"/i.exec(text)?.[1];
}
