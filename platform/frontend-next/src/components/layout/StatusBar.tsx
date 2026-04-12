"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { randomWalk } from "@/lib/sim";

type ControllerStatus = "ONLINE" | "OFFLINE";

function formatGiB(bytes: number) {
  const gib = bytes / 1024 / 1024 / 1024;
  return `${gib.toFixed(1)} GiB`;
}

export function StatusBar() {
  const [controller, setController] = useState<ControllerStatus>("ONLINE");
  const [cpu, setCpu] = useState(22);
  const [ramUsed, setRamUsed] = useState(5.4);
  const [ramTotal] = useState(16);

  useEffect(() => {
    const id = setInterval(() => {
      setCpu((p) => randomWalk(p, 4, 0, 100));
      setRamUsed((p) => randomWalk(p, 0.25, 0.5, ramTotal));

      // Rare fault injection for UX: OFFLINE is an emergency signal.
      if (Math.random() < 0.01) setController("OFFLINE");
      if (Math.random() < 0.06) setController("ONLINE");
    }, 900);
    return () => clearInterval(id);
  }, [ramTotal]);

  const ramPct = useMemo(() => (ramUsed / ramTotal) * 100, [ramUsed, ramTotal]);

  return (
    <div className="sticky top-0 z-20 flex h-12 items-center justify-between gap-4 border-b border-border-0/60 bg-bg-0/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="text-[12px] font-semibold tracking-tight text-fg-0">
          Status Global
        </div>
        <div className="h-4 w-px bg-border-0/70" />
        <div className="flex items-center gap-2 text-[12px] text-fg-1">
          <span>Status do Controlador SDN</span>
          <Badge tone={controller === "ONLINE" ? "ok" : "danger"}>{controller}</Badge>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[12px] text-fg-1">
        <div className="flex items-center gap-2">
          <span>CPU Host</span>
          <Badge tone={cpu < 85 ? "ok" : "danger"}>{cpu.toFixed(0)}%</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span>RAM Host</span>
          <Badge tone={ramPct < 90 ? "ok" : "danger"}>
            {formatGiB(ramUsed * 1024 * 1024 * 1024)} / {formatGiB(ramTotal * 1024 * 1024 * 1024)}
          </Badge>
        </div>
      </div>
    </div>
  );
}
