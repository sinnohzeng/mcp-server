export interface DocEntry {
  /** Relative path from docs root, e.g. "feishu/消息/发送消息.md" */
  path: string;
  /** First # heading, or filename if none */
  title: string;
  /** All ## headings */
  headings: string[];
  /** First 200 chars of body text (non-heading, non-empty lines) */
  summary: string;
}

export interface SearchResult {
  file: string;
  section: string;
  context: string;
  score: number;
  line: number;
}
