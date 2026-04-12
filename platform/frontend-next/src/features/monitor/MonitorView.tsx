"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { isoNow } from "@/lib/sim";

type Severity = "Normal" | "Emergência";

type EventRow = {
  ts: string;
  severity: Severity;
  msg: string;
  switchId: string;
  layer: "L0" | "L1" | "L2" | "L3";
};

function synthEvent(): EventRow {
  const sev: Severity = Math.random() < 0.08 ? "Emergência" : "Normal";
  const switchId = `s${Math.floor(Math.random() * 8) + 1}`;
  const layer = ["L0", "L1", "L2", "L3"][Math.floor(Math.random() * 4)] as EventRow["layer"];
  const msg =
    sev === "Normal"
      ? "telemetry tick"
      : "controller anomaly: heartbeat missed";
  return { ts: isoNow(), severity: sev, msg, switchId, layer };
}

export function MonitorView() {
  const [events, setEvents] = useState<EventRow[]>(() => Array.from({ length: 18 }).map(() => synthEvent()));

  useEffect(() => {
    const id = setInterval(() => {
      setEvents((prev) => {
        const next = [synthEvent(), ...prev];
        return next.slice(0, 80);
      });
    }, 700);
    return () => clearInterval(id);
  }, []);

  const emergencyCount = useMemo(() => events.filter((e) => e.severity === "Emergência").length, [events]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader title="Monitor" right={<span className="font-mono">stream</span>} />
        <CardBody>
          <div className="mb-2 text-[11px] text-fg-1">Eventos em tempo real (sintético).</div>
          <div className="overflow-auto rounded-xl border border-border-0/60">
            <table className="w-full min-w-[860px] border-collapse text-left text-[12px]">
              <thead className="sticky top-0 bg-bg-1/70 backdrop-blur">
                <tr className="border-b border-border-0/60 text-[11px] text-fg-1">
                  <th className="px-3 py-2 font-medium">Timestamp</th>
                  <th className="px-3 py-2 font-medium">Severidade</th>
                  <th className="px-3 py-2 font-medium">Switch</th>
                  <th className="px-3 py-2 font-medium">Camada</th>
                  <th className="px-3 py-2 font-medium">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, idx) => (
                  <tr key={`${e.ts}-${idx}`} className="border-b border-border-0/40 hover:bg-bg-2/20">
                    <td className="px-3 py-2 font-mono text-[11px] text-fg-1">{e.ts}</td>
                    <td className="px-3 py-2">
                      <Badge tone={e.severity === "Normal" ? "ok" : "danger"}>{e.severity}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-fg-0">{e.switchId}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-fg-1">{e.layer}</td>
                    <td className="px-3 py-2 text-fg-1">{e.msg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card className="h-fit">
        <CardHeader title="Alertas" right={<span className="font-mono">summary</span>} />
        <CardBody className="space-y-2">
          <div className="text-[12px] text-fg-1">
            Emergência (janela): <span className="font-mono text-fg-0">{emergencyCount}</span>
          </div>
          <div className="rounded-lg border border-border-0/60 bg-bg-2/20 p-3">
            <div className="mb-1 text-[11px] font-medium text-fg-1">Política de cor</div>
            <div className="text-[11px] text-fg-1">
              Vermelho somente para emergência; verde água para normal.
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
