import { execFileSync } from "node:child_process";

export const hasCodeChanges = (paths) => paths.some((path) =>
  !/^(src\/content\/|public\/uploads\/|src\/data\/tags\.json$)/.test(path));

if (process.argv[2]) {
  const paths = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", process.argv[2], "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean);
  process.stdout.write(`code=${hasCodeChanges(paths)}\n`);
}
