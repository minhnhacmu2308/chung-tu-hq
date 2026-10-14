import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../src/config/env.js";
import { ClaudeAiProvider, FakeAiProvider, RecordingAiProvider } from "../src/modules/extraction/infrastructure/index.js";
import { diffReports, formatReport, runEval, saveReport, type EvalReport } from "../src/modules/extraction/eval/run.js";

const root = path.resolve(process.cwd(), "../..");
const golden = path.join(root, "evals/golden");
const fixtures = path.join(root, "evals/fixtures");
const results = path.join(root, "evals/results");
const args = process.argv.slice(2);

if (args[0] === "diff") {
  const [a, b] = [args[1], args[2]];
  if (!a || !b) throw new Error("pnpm eval:diff <tagTrước> <tagSau>");
  const read = (t: string) => JSON.parse(readFileSync(path.join(results, `${t}.json`), "utf8")) as EvalReport;
  console.log(diffReports(read(a), read(b)));
} else {
  const live = args.includes("--live");
  const tag = args[args.indexOf("--tag") + 1];
  let ai = new FakeAiProvider(fixtures) as ConstructorParameters<typeof RecordingAiProvider>[0];
  if (live) {
    const env = loadEnv();
    if (!env.ANTHROPIC_API_KEY) throw new Error("--live cần ANTHROPIC_API_KEY");
    ai = new RecordingAiProvider(new ClaudeAiProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL), fixtures);
  }
  const report = await runEval(ai, golden);
  console.log(formatReport(report));
  if (args.includes("--tag") && tag) console.log(`Đã lưu ${saveReport(report, results, tag)}`);
  if (report.accuracy < 0.9) process.exitCode = 1;
}
