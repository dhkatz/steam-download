import { getBooleanInput, getInput, info, setFailed, setOutput, setSecret } from "@actions/core";
import os from "node:os";
import path from "node:path";
import * as steamcmd from "./steamcmd.js";

async function run() {
    const username = getInput("username", { trimWhitespace: true }) || "anonymous";
    const password = getInput("password", { trimWhitespace: true });
    const totp = getInput("totp", { trimWhitespace: true });
    const vdf = getInput("vdf", { trimWhitespace: true });
    for (const secret of [password, totp, vdf]) {
        if (secret) {
            setSecret(secret);
        }
    }
    const credentials: steamcmd.Credentials = { username, password, totp, vdf };
    const login = steamcmd.loginCommands(credentials);

    const appid = getInput("appid", { required: true, trimWhitespace: true });
    if (!/^\d+$/.test(appid)) {
        throw new Error(`Invalid appid "${appid}": expected a Steam app ID such as 2868840.`);
    }

    const temp = process.env.RUNNER_TEMP || os.tmpdir();
    const dir = path.resolve(getInput("path", { trimWhitespace: true }) || path.join(temp, "steam-download", appid));
    const platform = steamcmd.parsePlatform(getInput("platform"));
    const beta = getInput("beta", { trimWhitespace: true });
    const betaPassword = getInput("beta-password", { trimWhitespace: true });
    if (betaPassword) {
        setSecret(betaPassword);
    }
    const validate = getBooleanInput("validate");

    const steamcmdDir = path.join(temp, "steamcmd");
    info("Installing SteamCMD...");
    const exe = await steamcmd.install(steamcmdDir);

    // SteamCMD updates itself on its first run, and creates its config folder.
    info("Updating SteamCMD...");
    await steamcmd.run(exe, []);

    if (vdf && !password) {
        const file = await steamcmd.writeConfig(steamcmdDir, vdf);
        info(`Wrote the saved login to ${file}`);
    }

    info(`Downloading app ${appid} (${platform}) to ${dir}...`);
    await steamcmd.run(exe, steamcmd.appUpdateCommands({ appid, dir, platform, login, beta, betaPassword, validate }));

    const buildId = await steamcmd.readBuildId(dir, appid);
    if (!buildId) {
        throw new Error(`SteamCMD finished, but ${dir} has no app manifest for ${appid}. Does the account own it?`);
    }

    info(`Downloaded app ${appid}, build ${buildId}.`);
    setOutput("path", dir);
    setOutput("buildid", buildId);
}

run().catch((error) => {
    setFailed(error instanceof Error ? error.message : String(error));
});
