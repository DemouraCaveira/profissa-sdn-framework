import { useEffect, useMemo, useState } from "react";

export type MetricSampleDTO = {
  timestamp: string;
  node: string;
  layer: string;
  metric: string;
  value: number;
  details?: Record<string, unknown>;
  labels?: Record<string, unknown>;
};

export type TopologyDTO = {
  id: string;
  name?: string;
  nodes?: Array<Record<string, unknown>>;
  links?: Array<Record<string, unknown>>;
};

export type RunDTO = {
  id: string;
  experiment_id: string;
  topology_id: string;
  status: string;
  started_at?: string;
  finished_at?: string | null;
};

export type EventPayload = {
  type: string;
  generated_at: string;
  topology?: TopologyDTO | null;
  metrics?: MetricSampleDTO[];
  runs?: RunDTO[];
};

export function useEventStream(path = "/stream/events") {
  const [data, setData] = useState<EventPayload | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");

  const url = useMemo(() => {
    const base = import.meta.env.VITE_API_BASE || "http://localhost:8000";
    return `${base.replace(/\/$/, "")}${path}`;
  }, [path]);

  useEffect(() => {
    const es = new EventSource(url, { withCredentials: false });
    es.onopen = () => setStatus("open");
    es.onerror = () => setStatus("closed");
    es.onmessage = (evt) => {
      try {
        const payload: EventPayload = JSON.parse(evt.data);
        setData(payload);
      } catch (_) {
        // ignore malformed
      }
    };
    return () => es.close();
  }, [url]);

  return { data, status, url };
}
