import { create } from "zustand";
import { apiRequest } from "@/api/client";

/**
 * Global queue for FIR scans being processed on the server.
 *
 * The queue lives outside the page component on purpose. Extraction takes tens
 * of seconds, and an officer working through a stack of scans will switch tabs
 * while one runs. Previously the in-flight state died with the component and
 * the scan had to be re-uploaded; here the server owns the work and this store
 * just tracks it, so navigating away costs nothing.
 */

export type FirJobStatus = "queued" | "processing" | "done" | "error";

export type FirJob = {
  jobId: string;
  filename: string;
  status: FirJobStatus;
  stage: string;
  error?: string | null;
  createdAt?: number;
  /** Populated once the job finishes; holds extractedData/rawText/matches. */
  result?: any;
};

const POLL_INTERVAL_MS = 2000;

type FirQueueState = {
  jobs: FirJob[];
  polling: boolean;
  /** Job the officer is currently reviewing in the form, if any. */
  activeJobId: string | null;
  upload: (file: File) => Promise<string | null>;
  startPolling: () => void;
  stopPolling: () => void;
  refresh: () => Promise<void>;
  setActiveJob: (jobId: string | null) => void;
  discard: (jobId: string) => Promise<void>;
  clearFinished: () => void;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;

export const useFirQueue = create<FirQueueState>((set, get) => ({
  jobs: [],
  polling: false,
  activeJobId: null,

  upload: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const data = await apiRequest("/api/fir/upload", { method: "POST", body: formData });
      const job: FirJob = {
        jobId: data.jobId,
        filename: data.filename || file.name,
        status: data.status || "queued",
        stage: "Queued",
        createdAt: Date.now(),
      };
      set((s) => ({ jobs: [job, ...s.jobs] }));
      get().startPolling();
      return job.jobId;
    } catch (err: any) {
      // Surface the rejection as a failed row so it is visible in the queue
      // rather than disappearing into a toast the officer may have missed.
      set((s) => ({
        jobs: [
          {
            jobId: `local-${Date.now()}`,
            filename: file.name,
            status: "error",
            stage: "Failed",
            error: err?.message || "Upload failed",
            createdAt: Date.now(),
          },
          ...s.jobs,
        ],
      }));
      return null;
    }
  },

  refresh: async () => {
    const tracked = get().jobs.filter((j) => !j.jobId.startsWith("local-"));
    if (tracked.length === 0) return;

    const pending = tracked.filter((j) => j.status === "queued" || j.status === "processing");
    if (pending.length === 0) {
      get().stopPolling();
      return;
    }

    // Only the unfinished jobs are re-fetched; a completed result is already
    // held locally and can be large.
    const updates = await Promise.all(
      pending.map(async (job) => {
        try {
          return await apiRequest(`/api/fir/jobs/${job.jobId}`);
        } catch {
          return null;
        }
      })
    );

    set((s) => ({
      jobs: s.jobs.map((job) => {
        const update = updates.find((u) => u && u.jobId === job.jobId);
        return update ? { ...job, ...update } : job;
      }),
    }));

    if (get().jobs.every((j) => j.status === "done" || j.status === "error")) {
      get().stopPolling();
    }
  },

  startPolling: () => {
    if (pollTimer) return;
    set({ polling: true });
    pollTimer = setInterval(() => {
      void get().refresh();
    }, POLL_INTERVAL_MS);
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    set({ polling: false });
  },

  setActiveJob: (jobId) => set({ activeJobId: jobId }),

  discard: async (jobId: string) => {
    set((s) => ({
      jobs: s.jobs.filter((j) => j.jobId !== jobId),
      activeJobId: s.activeJobId === jobId ? null : s.activeJobId,
    }));
    if (!jobId.startsWith("local-")) {
      try {
        await apiRequest(`/api/fir/jobs/${jobId}`, { method: "DELETE" });
      } catch {
        // The server drops finished jobs on its own TTL; a failed delete here
        // only means the row lingers server-side, which is harmless.
      }
    }
  },

  clearFinished: () =>
    set((s) => ({ jobs: s.jobs.filter((j) => j.status === "queued" || j.status === "processing") })),
}));
