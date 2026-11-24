# Tandem desktop releases

Tandem updates itself from GitHub releases of this fork through the upstream
updater (**Settings → Updates**). Release with:

```sh
scripts/fork/release-desktop.sh 0.0.50            # build and verify
scripts/fork/release-desktop.sh 0.0.50 --publish  # also create release v0.0.50
```

The version must be higher than the installed one. The script bakes
`InM1nd/t3code-jcode` into `app-update.yml` and uploads the DMG, zip, blockmaps,
and `latest-mac.yml`.

## Signing

Squirrel.Mac installs an update only when it satisfies the installed app's
designated requirement. Adhoc signatures change on every build, so every
release is signed with the self-signed **Tandem Code Signing** certificate
(`TANDEM_MAC_SIGN_IDENTITY`, read by `scripts/build-desktop-artifact.ts` only
for unsigned builds). Its designated requirement pins the certificate, so any
build signed with it can replace another.

The certificate lives in the login keychain, trusted for code signing. A backup
(`tandem-code-signing.p12`, password in `p12-password.txt`) is in
`~/.tandem-signing`. If the certificate is lost or replaced, installed apps stop
accepting updates and need one manual install of a build signed with the new one.

Builds are not notarized, so the first manual install still needs
right-click → Open.
