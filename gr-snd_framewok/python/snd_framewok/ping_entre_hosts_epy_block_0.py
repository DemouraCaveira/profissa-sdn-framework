import time
import subprocess
from gnuradio import gr
import pmt

class ForwardingTableS1(gr.basic_block):
    def __init__(self, container_name="s1", update_interval=5.0, colorize=False):
        gr.basic_block.__init__(
            self,
            name="ForwardingTableS1",
            in_sig=[],
            out_sig=[]
        )

        self.container_s1 = container_name
        self.update_interval = update_interval
        self.colorize = colorize
        self.last_update = 0
        self.last_stats = {}  # {priority: (packets, bytes)}

        # Portas de mensagens
        self.message_port_register_in(pmt.intern("tick"))
        self.message_port_register_out(pmt.intern("out"))
        self.set_msg_handler(pmt.intern("tick"), self._on_tick)

    # ---------- Descoberta/execução ----------
    def _detect_bridge_name(self):
        try:
            result = subprocess.run(
                ["docker", "exec", self.container_s1, "ovs-vsctl", "list-br"],
                capture_output=True, text=True, timeout=5
            )
            bridges = [b.strip() for b in result.stdout.splitlines() if b.strip()]
            return bridges[0] if bridges else None
        except Exception:
            return None

    def _run(self, *cmd, timeout=5):
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            return (result.stdout + result.stderr).strip()
        except subprocess.TimeoutExpired:
            return "Timeout ao executar: " + " ".join(cmd)
        except Exception as e:
            return f"Erro ao executar {' '.join(cmd)}: {e}"

    def _get_forwarding_table_raw(self):
        bridge_name = self._detect_bridge_name()
        if not bridge_name:
            return None, "Nenhum bridge encontrado no container."
        output = self._run("docker", "exec", self.container_s1,
                           "ovs-ofctl", "dump-flows", bridge_name)
        return bridge_name, output

    # ---------- Parsing ----------
    def _extract_field(self, line, key):
        for part in line.split():
            if part.startswith(key + "="):
                val = part.split("=", 1)[1]
                return val.rstrip(",")
        return None

    def _parse_flows(self, raw):
        lines = raw.splitlines()
        flows = []
        for line in lines:
            if "priority=" in line and "actions=" in line:
                clean = line.replace(",", " ")
                prio = self._extract_field(clean, "priority")
                pkts = self._extract_field(clean, "n_packets")
                byts = self._extract_field(clean, "n_bytes")
                acts = self._extract_field(clean, "actions")
                if prio is None or pkts is None or byts is None or acts is None:
                    continue
                try:
                    pkts_i = int(pkts)
                    byts_i = int(byts)
                except Exception:
                    continue
                flows.append((prio, pkts_i, byts_i, acts))
        return flows

    # ---------- Formatação ----------
    def _format_output(self, bridge, flows):
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        header = f"[{ts}] bridge={bridge}\n"
        header += f"{'Prio':>4} {'Pkts':>6} {'ΔPkt':>5} {'Bytes':>8} {'ΔB':>6} Actions\n"
        header += "-" * 50 + "\n"

        if not flows:
            return header + "Nenhum fluxo encontrado.\n"

        rows = []
        for prio, pkts, byts, acts in flows:
            last_p, last_b = self.last_stats.get(prio, (pkts, byts))
            d_p = pkts - last_p
            d_b = byts - last_b
            self.last_stats[prio] = (pkts, byts)
            rows.append(f"{prio:>4} {pkts:>6} {d_p:+5} {byts:>8} {d_b:+6} {acts}")

        return header + "\n".join(rows) + "\n"

    # ---------- Tick ----------
    def _on_tick(self, msg):
        if time.time() - self.last_update < self.update_interval:
            return

        bridge, raw = self._get_forwarding_table_raw()
        if bridge is None:
            final_output = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {raw}\n"
        else:
            flows = self._parse_flows(raw)
            final_output = self._format_output(bridge, flows)

        # Terminal
        print(final_output, end="")

        # Envia para GUI
        self.message_port_pub(pmt.intern("out"), pmt.to_pmt(final_output))

        self.last_update = time.time()

