"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "@/lib/cn";
import { Server, Cpu, Network } from "lucide-react";

function Frame({
  title,
  subtitle,
  icon,
  tone,
  tooltip,
}: {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  tone: "switch" | "host";
  tooltip?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group relative min-w-[160px] rounded-xl border bg-bg-1/60 px-3 py-2 text-left",
        "border-border-0/60",
        tone === "switch" && "shadow-none",
        tone === "host" && "shadow-none",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? <div className="text-fg-1">{icon}</div> : null}
          <div className="min-w-0 truncate font-mono text-[12px] font-semibold text-fg-0">{title}</div>
        </div>
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            tone === "switch" ? "bg-accent-ok" : "bg-border-0",
          )}
        />
      </div>
      <div className="mt-0.5 text-[11px] text-fg-1">{subtitle}</div>

      {tooltip ? (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden -translate-x-1/2",
            "w-[220px] rounded-lg border border-border-0/60 bg-bg-0/90 p-2",
            "text-[10px] text-fg-1 backdrop-blur",
            "group-hover:block",
          )}
        >
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}

export function SwitchNode(
  props: NodeProps<{
    id: string;
    dpid?: string;
    mgmtIp?: string;
    pktStats?: { rxPps: number; txPps: number; dropPps: number };
  }>,
) {
  const { data } = props;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-border-0" />
      <Frame
        title={data.id}
        subtitle={data.dpid ? `dpid=${data.dpid}` : "switch"}
        tone="switch"
        icon={<Network className="h-4 w-4" />}
        tooltip={
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-fg-1">sumário tráfego</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                <div className="text-[10px] text-fg-1">TX</div>
                <div className="mt-0.5 font-mono text-[11px] text-fg-0">{data.pktStats?.txPps ?? 0} pps</div>
              </div>
              <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                <div className="text-[10px] text-fg-1">RX</div>
                <div className="mt-0.5 font-mono text-[11px] text-fg-0">{data.pktStats?.rxPps ?? 0} pps</div>
              </div>
            </div>
          </div>
        }
      />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-border-0" />
    </>
  );
}

export function HostNode(props: NodeProps<{ id: string; ip?: string; mac?: string }>) {
  const { data } = props;
  return (
    <>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-border-0" />
      <Frame title={data.id} subtitle={data.ip ? `ip=${data.ip}` : "host"} tone="host" icon={<Cpu className="h-4 w-4" />} />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-border-0" />
    </>
  );
}

export function ControllerNode(props: NodeProps<{ id: string; mgmtIp?: string; status?: "online" | "offline" }>) {
  const { data } = props;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-border-0" />
      <Frame
        title={data.id}
        subtitle={data.mgmtIp ? `mgmt=${data.mgmtIp}` : "controller"}
        tone="switch"
        icon={<Server className="h-4 w-4" />}
      />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-border-0" />
    </>
  );
}

export const nodeTypes = {
  switch: SwitchNode,
  host: HostNode,
  controller: ControllerNode,
};
