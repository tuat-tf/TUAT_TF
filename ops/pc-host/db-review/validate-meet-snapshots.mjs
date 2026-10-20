// Validates synthetic SQL output; never opens a DB or reads environment secrets.
import { createRequire, registerHooks } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(import.meta.dirname, "../../..");
let input = "";
for await (const chunk of process.stdin) input += chunk;
const snapshots = input.split(/\r?\n/).filter(line => line.startsWith("MEET_SNAPSHOT:"))
  .map(line => JSON.parse(line.slice("MEET_SNAPSHOT:".length)));
if (snapshots.length < 2) throw new Error("Expected synthetic legacy and generic meet snapshots");
const sources = [];
const sourceRoot = pathToFileURL(resolve(root, "src/lib") + "/").href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier.startsWith("./") && context.parentURL?.startsWith(sourceRoot)
      ? `${specifier}.ts` : specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(sourceRoot) || !url.endsWith(".ts")) return nextLoad(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    sources.push({ path: url.slice(sourceRoot.length), sha256: createHash("sha256").update(source).digest("hex") });
    return { format: "module", shortCircuit: true, source: ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText };
  },
});
const { isCompetitionMeetSnapshot } = await import(pathToFileURL(resolve(root, "src/lib/competition-meet-snapshot.ts")).href);
for (const snapshot of snapshots) {
  if (!isCompetitionMeetSnapshot(snapshot, snapshot.competitionId)) throw new Error("Actual synthetic RPC snapshot rejected");
}
process.stdout.write(JSON.stringify({
  passed: snapshots.length, syntheticOnly: true,
  validatorSources: sources,
}));
