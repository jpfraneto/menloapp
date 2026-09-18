import { readFile } from "node:fs/promises";

// Anky's first release predates catalog presentation media. This exact icon was
// extracted from its already-public source archive after verifying SHA-256.
// This is share artwork only; it does not amend or re-sign the catalog record.
export async function legacyShareIcon(releaseDigest: string, sourceDigest: unknown): Promise<Buffer | undefined> {
  if (releaseDigest !== "0xbfedc96908c631e6cb65bade0e7ee3d3002e0afb08d82a797d435f50211a0744"
      || sourceDigest !== "0xb39de082c43c69a3dc517578f319a3fe878c455961ea5ae015106cbd24884bec") return undefined;
  return readFile(new URL("../assets/social/anky-icon.png", import.meta.url));
}
