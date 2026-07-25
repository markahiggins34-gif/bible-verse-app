export interface VerseResult {
  reference: string;
  text: string;
  context: string;
}

export interface VerseApiResponse {
  verses?: VerseResult[];
  error?: string;
}
