/**
 * promptfoo custom provider: runs the agent CLI as a subprocess and
 * returns its stdout as the model output.
 *
 * The agent in turn talks to the MCP server over stdio — so every eval
 * exercises the full path: prompt → agent → MCP → safety layer → data.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default class AgentProvider {
  id() {
    return "notion-agent-cli";
  }

  async callApi(prompt) {
    try {
      const output = execFileSync(
        "npx",
        ["tsx", "src/client/agent.ts", "--ask", prompt],
        {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: 120_000,
          env: { ...process.env, MCP_DATA_MODE: "sample" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      return { output: output.trim() };
    } catch (err) {
      return { error: `agent invocation failed: ${err.message}` };
    }
  }
}
