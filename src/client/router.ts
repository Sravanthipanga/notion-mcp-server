/**
 * Deterministic question router for the agent client.
 *
 * No LLM is involved: the question is matched against a small set of
 * intent patterns and mapped to exactly one MCP tool. This makes the
 * agent's behaviour reproducible — which is what lets promptfoo assert
 * on it deterministically.
 */

export type Intent =
  | { tool: "list_databases" }
  | { tool: "search_notion"; query: string }
  | { tool: "get_page"; title: string }
  | { tool: "query_database"; databaseName: string; filterText?: string };

function clean(text: string): string {
  return text.trim().replace(/[?.!]+$/, "").trim();
}

function splitAbout(text: string): { head: string; about?: string } {
  const m = text.match(/^(.*?)\s+about\s+(.+)$/i);
  if (m) return { head: m[1].trim(), about: clean(m[2]) };
  return { head: text };
}

export function routeQuestion(rawQuestion: string): Intent {
  const q = rawQuestion.trim();

  // 1) List databases.
  if (/\b(list|show|what|which)\b[^.]*\bdatabases?\b/i.test(q) && !/\bin\b/i.test(q)) {
    return { tool: "list_databases" };
  }
  if (/^databases?$/i.test(clean(q))) return { tool: "list_databases" };

  // 2) Database rows: "rows in X (about Y)", "query the X database", "show the X database".
  const rowsIn = q.match(/\b(?:rows|entries|projects|items)\s+in\s+(.+)$/i);
  if (rowsIn) {
    const { head, about } = splitAbout(rowsIn[1]);
    return {
      tool: "query_database",
      databaseName: clean(head.replace(/^the\s+/i, "")),
      filterText: about,
    };
  }
  const queryDb = q.match(/\b(?:query|show|open|get)\s+(?:the\s+)?(.+?)\s+database\b/i);
  if (queryDb) {
    const { head, about } = splitAbout(queryDb[1]);
    return { tool: "query_database", databaseName: clean(head), filterText: about };
  }

  // 3) Read a page by title: "show page X", "read X page", "open page X".
  const showPage = q.match(/\b(?:show|read|open|get)\s+(?:the\s+)?page\s+(.+)$/i);
  if (showPage) return { tool: "get_page", title: clean(showPage[1]) };

  // 4) Search: "search X", "find X", "search my notes for X".
  const search = q.match(/\b(?:search|find)\b(?:\s+my\s+notes)?(?:\s+for)?\s+(.+)$/i);
  if (search) return { tool: "search_notion", query: clean(search[1]) };

  // 5) Fallback: treat the whole question as a search.
  return { tool: "search_notion", query: clean(q) };
}
