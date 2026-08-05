export interface VoyagerJobPostingResponse {
  data: {
    originalListedAt: number; // unix ms
    expireAt?: number; // unix ms
  };
}

export interface ParsedJobData {
  jobId?: string | undefined;
  originalListedAt: number;
  expireAt: number | null;
  daysSinceOriginal: number;
}

export const MESSAGE_SOURCE = "truedate-inject" as const;

export interface TrueDateMessage {
  source: typeof MESSAGE_SOURCE;
  payload: ParsedJobData;
}
