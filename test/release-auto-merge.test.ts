import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The release pull request's auto-merge job (`release-auto-merge.yml`) ran
 * `gh pr merge --auto --squash` and nothing else. When it ran while only
 * non-required checks (mutation, coverage) were still going, GitHub reports
 * the pull request as `unstable` and refuses to enable auto-merge, so the
 * job failed and the release pull request sat there until someone re-ran it.
 * The step's own shell is exercised here against a fake `gh`, so the decision
 * is tested without GitHub.
 */

const WORKFLOW = join(
  import.meta.dir,
  "..",
  ".github",
  "workflows",
  "release-auto-merge.yml",
);

const UNSTABLE =
  "GraphQL: Pull request Pull request is in unstable status (enablePullRequestAutoMerge)";
const CLEAN =
  "GraphQL: Pull request Pull request is in clean status (enablePullRequestAutoMerge)";
const CONFLICT =
  "X Pull request alrayyes/forge-dashboard-sdk-node#180 is not mergeable: the merge commit cannot be cleanly created.";
const REQUIRED_PENDING =
  "X Pull request alrayyes/forge-dashboard-sdk-node#180 is not mergeable: 5 of 5 required status checks are expected.";

/** The `run` script of the step that calls `gh pr merge`. */
function mergeStepScript(): string {
  const workflow = Bun.YAML.parse(readFileSync(WORKFLOW, "utf8")) as {
    jobs: Record<string, { steps: Array<{ run?: string }> }>;
  };
  const scripts = Object.values(workflow.jobs)
    .flatMap((job) => job.steps)
    .map((step) => step.run)
    .filter((run): run is string => run?.includes("gh pr merge") === true);
  expect(scripts).toHaveLength(1);

  return scripts[0] as string;
}

type Fake = {
  /** Output and exit code of `gh pr merge --auto ...`. */
  auto: { out: string; rc: number };
  /** Output and exit code of `gh pr merge --squash ...` (no --auto). */
  direct: { out: string; rc: number };
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "release-auto-merge-"));
  // A fake `gh` that logs its arguments and answers from environment
  // variables, one answer for the --auto call and one for the direct merge.
  const gh = [
    "#!/usr/bin/env bash",
    'echo "$*" >> "$FAKE_LOG"',
    'for arg in "$@"; do',
    '  if [ "$arg" = "--auto" ]; then',
    '    printf "%s\\n" "$FAKE_AUTO_OUT"',
    '    exit "$FAKE_AUTO_RC"',
    "  fi",
    "done",
    'printf "%s\\n" "$FAKE_DIRECT_OUT"',
    'exit "$FAKE_DIRECT_RC"',
  ].join("\n");
  writeFileSync(join(dir, "gh"), gh);
  chmodSync(join(dir, "gh"), 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function run(fake: Fake, env: Record<string, string> = {}) {
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  const proc = Bun.spawn(["bash", "-c", mergeStepScript()], {
    env: {
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      PR_URL: "https://github.com/alrayyes/forge-dashboard-sdk-node/pull/180",
      GH_TOKEN: "secret-release-token",
      FAKE_LOG: log,
      FAKE_AUTO_OUT: fake.auto.out,
      FAKE_AUTO_RC: String(fake.auto.rc),
      FAKE_DIRECT_OUT: fake.direct.out,
      FAKE_DIRECT_RC: String(fake.direct.rc),
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);

  return { stdout, stderr, code, calls };
}

const ok = { out: "", rc: 0 };

describe("release-auto-merge step", () => {
  test("arms auto-merge and stops when GitHub accepts it", async () => {
    const result = await run({ auto: ok, direct: ok });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      "pr merge --auto --squash https://github.com/alrayyes/forge-dashboard-sdk-node/pull/180",
    ]);
  });

  test("merges directly when GitHub says the pull request is unstable", async () => {
    // Unstable means every required check passed and only a non-required one
    // is still going: nothing left for auto-merge to wait for.
    const result = await run({
      auto: { out: UNSTABLE, rc: 1 },
      direct: ok,
    });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      "pr merge --auto --squash https://github.com/alrayyes/forge-dashboard-sdk-node/pull/180",
      "pr merge --squash https://github.com/alrayyes/forge-dashboard-sdk-node/pull/180",
    ]);
  });

  test("merges directly when the pull request is already clean", async () => {
    const result = await run({
      auto: { out: CLEAN, rc: 1 },
      direct: ok,
    });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      "pr merge --auto --squash https://github.com/alrayyes/forge-dashboard-sdk-node/pull/180",
      "pr merge --squash https://github.com/alrayyes/forge-dashboard-sdk-node/pull/180",
    ]);
  });

  test("fails visibly, and merges nothing, on any other refusal", async () => {
    const result = await run({
      auto: { out: CONFLICT, rc: 1 },
      direct: ok,
    });

    expect(result.code).not.toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.stdout + result.stderr).toContain(
      "cannot be cleanly created",
    );
  });

  test("fails on a refusal that only mentions 'unstable' in passing", async () => {
    // The match is on GitHub's refusal sentence, not the bare word: a check
    // named "unstable-tests" in an unrelated refusal must not trigger a merge.
    const result = await run({
      auto: {
        out: "X Pull request alrayyes/forge-dashboard-sdk-node#180 is not mergeable: check unstable-tests is expected.",
        rc: 1,
      },
      direct: ok,
    });

    expect(result.code).not.toBe(0);
    expect(result.calls).toHaveLength(1);
  });

  test("fails when the direct merge is refused (a required check is not done)", async () => {
    const result = await run({
      auto: { out: UNSTABLE, rc: 1 },
      direct: { out: REQUIRED_PENDING, rc: 1 },
    });

    expect(result.code).not.toBe(0);
    expect(result.calls).toHaveLength(2);
    expect(result.stdout + result.stderr).toContain("required status checks");
  });

  test("does not print the token", async () => {
    const result = await run({
      auto: { out: UNSTABLE, rc: 1 },
      direct: ok,
    });

    expect(result.stdout + result.stderr).not.toContain("secret-release-token");
  });
});
