import { expect, test } from "bun:test";
import { renderSocialCard, socialMetadata } from "../src/social-cards.ts";
import { legacyShareIcon } from "../src/legacy-share-icon.ts";

test("social metadata escapes all app-controlled text and custom image attributes", () => {
  const html = socialMetadata({ title: 'App"><script>alert(1)</script>', description: 'A & B "quoted"', url: "https://menloapp.lol/app", image: 'https://menloapp.lol/image.png?a=1&b=2' });
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("A &amp; B &quot;quoted&quot;");
  expect(html).toContain("image.png?a=1&amp;b=2");
});

test("long names and descriptions still produce a bounded card, and oversized raster icons are rejected before decoding", () => {
  const png = renderSocialCard({ title: "W".repeat(100), description: "A long description with words and emoji 🌱 ".repeat(80), url: `https://menloapp.lol/${"a".repeat(64)}` });
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  const bomb = Buffer.from(png);
  bomb.writeUInt32BE(100000, 16);
  expect(() => renderSocialCard({ title: "App", description: "", url: "https://menloapp.lol/app", icon: { bytes: bomb, type: "image/png" } })).toThrow("16 megapixels");
});

test("Anky's legacy artwork matches the verified public source icon and cannot be inherited by another release", async () => {
  const digest = "0xbfedc96908c631e6cb65bade0e7ee3d3002e0afb08d82a797d435f50211a0744";
  const source = "0xb39de082c43c69a3dc517578f319a3fe878c455961ea5ae015106cbd24884bec";
  const bytes = await legacyShareIcon(digest, source);
  expect(new Bun.CryptoHasher("sha256").update(bytes!).digest("hex")).toBe("b72c99ed04b5d5f66661546ec11b9d7a6e68ed3d80405e852a926bde797958a0");
  expect(await legacyShareIcon("0x" + "a".repeat(64), source)).toBeUndefined();
  expect(await legacyShareIcon(digest, "0x" + "a".repeat(64))).toBeUndefined();
});
