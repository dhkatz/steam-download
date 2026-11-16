Steam Download
==============

A GitHub Action that downloads a game or app from Steam with SteamCMD, on Linux, macOS and Windows runners.

* Logs in the same way as [gmod-workshop/workshop-upload](https://github.com/gmod-workshop/workshop-upload), so
  both can share the same secrets.
* Downloads any platform's files on any runner (`platform: windows` on `ubuntu-latest`, for example).
* Installs outside the workspace by default, so the game can't end up in an artifact or commit by accident.
* Never waits for a password or Steam Guard prompt: an expired login fails straight away.

Usage
-----

```yaml
jobs:
  build:
    runs-on: windows-latest
    environment: steam   # keep the login in an environment, limited to the branches or tags that need it
    steps:
      - uses: actions/checkout@v4

      - name: Download the game
        id: game
        uses: dhkatz/steam-download@v2
        with:
          username: ${{ secrets.STEAM_USERNAME }}
          vdf: ${{ secrets.STEAM_VDF }}
          appid: 2868840

      - run: dotnet build -p:GameDir="${{ steps.game.outputs.path }}"
```

Free apps, such as dedicated servers, need no account:

```yaml
      - uses: dhkatz/steam-download@v2
        with:
          appid: 1007
```

**Inputs**

| Name | Description | Required |
| ---- | ----------- | -------- |
| `appid` | Steam app ID to download | Yes |
| `username` | Steam username. Default `anonymous`, which works for free apps. | No |
| `vdf` | Base64 of SteamCMD's `config/config.vdf` after logging in once (recommended; see below) | No |
| `password` | Steam password. Needs Steam Guard off, or `totp`. | No |
| `totp` | Steam Guard code, with `password` | No |
| `path` | Where to install. Default `<runner temp>/steam-download/<appid>`. | No |
| `platform` | `windows`, `linux` or `macos` files. Default: the runner's own. | No |
| `beta` | Beta branch to download | No |
| `beta-password` | Password for a private beta branch | No |
| `validate` | Check every file after downloading. Default `false`. | No |

**Outputs**

| Name | Description |
| ---- | ----------- |
| `path` | Where the app was installed |
| `buildid` | The Steam build ID installed. Useful for version checks. |

Logging in
----------

The account has to own the app, unless it's free. Use a **VDF**: SteamCMD's saved session, so the workflow needs no
password and no Steam Guard code.

1. Install SteamCMD on your computer and log in once: `steamcmd +login <username> +quit`. Approve the login in the
   Steam app, or enter the Steam Guard code.
2. Base64 its `config/config.vdf` (next to `steamcmd.exe` on Windows, `~/Steam/config/` on Linux) and save it as a
   secret, e.g. with the GitHub CLI:
   ```bash
   base64 -w0 config/config.vdf | gh secret set STEAM_VDF --env steam
   ```
3. Save the username as a secret too (`STEAM_USERNAME`). SteamCMD prints it in the log, and GitHub hides secrets
   there.

The VDF is a logged-in session for the whole account, so keep it in an
[environment](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment)
limited to the branches or tags that need it. Sessions expire eventually; when the login starts failing, log in again
and update the secret.

**Don't cache or upload the downloaded files** in a public repository: pull requests from forks can restore the base
branch's caches, and artifacts are downloadable by anyone who can see the run.

Migrating from v1
-----------------

v2 is a JavaScript action (v1 was a PowerShell script).

* The default `path` moved from `./game` in the workspace to the runner's temp folder. Use the `path` output, or set
  `path: game` for the old location.
* `vdf` is the base64 of `config.vdf`, as v1 actually used it (its description said a path).
* New: `platform`, `beta`, `beta-password`, `validate`, and the `path` and `buildid` outputs.
