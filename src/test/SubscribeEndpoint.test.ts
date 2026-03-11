import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const phpBinaryAvailable = (() => {
  const phpVersionProbe = spawnSync("php", ["-v"], { encoding: "utf8" });
  if (phpVersionProbe.status !== 0) return false;
  // The subscribe script requires PDO + sqlite driver (not the SQLite3 class)
  const pdoProbe = spawnSync("php", ["-r", "if(!in_array('sqlite',PDO::getAvailableDrivers()))exit(1);"], { encoding: "utf8" });
  return pdoProbe.status === 0;
})();

const runIfPhpAvailable = phpBinaryAvailable ? describe : describe.skip;

function toPhpSingleQuotedString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

runIfPhpAvailable("Newsletter subscribe PHP endpoint", () => {
  it("creates SQLite storage file for valid POST submissions", () => {
    // BUG6: regression guard for environments where SQLite file was not created.
    const temporaryStorageDirectory = mkdtempSync(path.join(tmpdir(), "claudine-subscribe-"));
    const scriptPath = path.resolve("website/public/subscribe.php");
    const phpCode = [
      '$_SERVER["REQUEST_METHOD"]="POST";',
      '$_SERVER["HTTP_ACCEPT"]="application/json";',
      '$_POST=["email"=>"bug6@example.com","company"=>""];',
      `include ${toPhpSingleQuotedString(scriptPath)};`,
    ].join("");

    try {
      const response = execFileSync("php", ["-r", phpCode], {
        encoding: "utf8",
        env: {
          ...process.env,
          CLAUDINE_SUBSCRIBE_STORAGE_DIR: temporaryStorageDirectory,
        },
      });

      const payload = JSON.parse(response) as { ok: boolean };
      const sqlitePath = path.join(temporaryStorageDirectory, "newsletter-subscribers.sqlite");

      expect(payload.ok).toBe(true);
      expect(existsSync(sqlitePath)).toBe(true);
      expect(statSync(sqlitePath).size).toBeGreaterThan(0);
    } finally {
      rmSync(temporaryStorageDirectory, { recursive: true, force: true });
    }
  });
});
