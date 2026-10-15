import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../src/config/env.js";
import { ClaudeAiProvider, FakeAiProvider, RecordingAiProvider } from "../src/modules/extraction/infrastructure/index.js";
import { diffReports, formatReport, runEval, saveReport, type EvalReport } from "../src/modules/extraction/eval/run.js";
import { formatLotReport, runLotEval } from "../src/modules/extraction/eval/lot-run.js";

const root = path.resolve(process.cwd(), "../..");
const golden = path.join(root, "evals/golden");
const fixtures = path.join(root, "evals/fixtures");
const results = path.join(root, "evals/results");
const args = process.argv.slice(2);

if (args.includes("--lot")) {
  // Lô thật: pnpm eval --live --lot <thư mục> [--lot <thư mục>…] – gọi AI thật, tốn tiền.
  const env = loadEnv();
  if (!args.includes("--live") || !env.ANTHROPIC_API_KEY) throw new Error("--lot cần --live và ANTHROPIC_API_KEY");
  const ai = new ClaudeAiProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL);
  const dirs = args.flatMap((a, i) => (a === "--lot" && args[i + 1] ? [path.resolve(root, args[i + 1]!)] : []));
  const reports = [];
  for (const dir of dirs) {
    const r = await runLotEval(ai, dir);
    reports.push(r);
    console.log(formatLotReport(r));
    writeFileSync(path.join(dir, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(r, null, 2));
  }
  const total = reports.reduce((a, r) => a + r.total, 0);
  const matched = reports.reduce((a, r) => a + r.matched, 0);
  console.log(`\nTỔNG: ${matched}/${total} = ${total ? ((matched / total) * 100).toFixed(1) : 0}%`);
  if (total && matched / total < 0.95) process.exitCode = 1;
} else if (args[0] === "diff") {
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
