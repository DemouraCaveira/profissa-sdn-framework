# NetMon GNU Radio OOT — Documentacao Cientifica (Estilo IEEE)

## 1. Escopo e Ambiente
Documento sobre os blocos OOT do NetMon e fluxos de referencia para monitorar testbeds em conteineres. Linguagem tecnica voltada a comunidade cientifica (padrao IEEE).

- **Dependencias**: GNU Radio 3.10.x; Docker com acesso `docker exec`; `tcpdump` dentro dos conteineres; utilitarios Open vSwitch (`ovs-ofctl`, `ovs-vsctl`) nos switches; Python 3.10 com `dnspython`.
- **Topologia em execucao**: Conteineres `h1`, `h2`, `s1`, etc., ligados por bridges virtuais. Logs padrao em `${NETMON_LOG_DIR:-$PWD/raw}` no host (criado se nao existir).
- **Canal de metricas**: Quando presente, a porta de mensagem `metrics` emite JSON estruturado, adequado a `message_debug`, ZMQ, etc.

## 2. Referencia de Blocos
Para cada bloco: proposito, I/O, parametros, metricas e interpretacao das saidas.

### 2.1 Alerts (`netmon.alerts.Alerts`)
- **Proposito**: Ler amostras recentes de logs (ex.: host ping) e gerar alertas por limiar (latencia, jitter; perda futura).
- **Entradas/Saidas**: Sem fluxo; sem portas de mensagem. Loop autonomo.
- **Parametros**: `files` (lista separada por virgula), `interval` (s), `latency_threshold_ms`, `loss_threshold_pct`, `jitter_threshold_ms`, `log_to_file`, `log_dir`.
- **Metricas/Logs**: Linhas de alerta; arquivo `alerts.txt` se `log_to_file=True`. Nao ha porta JSON.
- **Interpretacao**: Linha tipo `[timestamp] ALERTA: <tipo> <valor> > <limite> em <arquivo>`. Silencio indica valores dentro dos limites.

### 2.2 DNS Resolver Monitor (`netmon.dns_resolver.DNSResolverMonitorBlock`)
- **Proposito**: Medir a latencia de consultas DNS para um servidor/dominio especifico.
- **Entradas/Saidas**: Saida de fluxo `float32` (latencia); porta de mensagem `metrics` (JSON).
- **Parametros**: `dns_server`, `query_name`, `interval` (s).
- **Metricas/Logs**: JSON `{module:"dns_resolver", server, query, latency_s, ok, ts, ts_iso}`; impressao de sucesso/erro no console.
- **Interpretacao**: Valor do fluxo = latencia (s); `-1.0` em falha; `0.0` quando o bloco esta ocioso entre intervalos. `ok=false` sinaliza erro de resolucao ou de alcance.

### 2.3 Docker Stats (`netmon.docker_stats.DockerStats`)
- **Proposito**: Coletar `docker stats --no-stream` no host e emitir uso de recursos por conteiner.
- **Entradas/Saidas**: Sem fluxo; porta de mensagem `metrics`.
- **Parametros**: `containers` (filtro, vazio=todos), `interval` (s), `log_to_file` (apenas console).
- **Metricas/Logs**: JSON `{module:"docker_stats", containers:[{Name, CPUPerc, MemUsage, MemPerc, NetIO, BlockIO}], ts, ts_iso}`.
- **Interpretacao**: `CPUPerc` relativo ao host; `MemUsage/MemPerc` do cgroup; `NetIO/BlockIO` acumulados. Lista vazia = nenhum alvo ou falha no comando.

### 2.4 Forwarding Table S1 (`netmon.forwarding_table_s1.ForwardingTableS1`)
- **Proposito**: Consultar fluxos do Open vSwitch em um conteiner e calcular deltas.
- **Entradas/Saidas**: Mensagem `tick` (in); mensagens `out` (texto) e `metrics` (JSON). Loop autonomo se `auto_start=True`.
- **Parametros**: `container_name` (padrao `s1`), `update_interval` (s), `bridge_override`, `log_to_file`, `log_dir`.
- **Metricas/Logs**: JSON `{module:"forwarding_table_s1", container, bridge, flows:[{priority, n_packets, n_bytes, d_packets, d_bytes, actions}], ts, ts_iso}`; log `forwarding_table_s1.txt` se `log_to_file=True`.
- **Interpretacao (tabela formatada)**: `Prio` (prioridade), `Pkts/Bytes` acumulados, `Delta` de pacotes/bytes, `Actions` (acao OVS). Deltas zero = nenhum trafego novo no intervalo; apenas a regra de prioridade 0 sugere politica default.

### 2.5 Host Ping (`netmon.host_ping`)
- **Variantes**: `HostPingAuto` (fluxo) e `HostPingMsg` (mensagem).
- **Entradas/Saidas**: Auto produz fluxo `float32` e porta `metrics`; Msg consome `tick` e publica `out` (texto) e `metrics`.
- **Parametros**: `container_name`, `target_ip`, `interval` (auto), `timeout`, `log_to_file`, `log_dir`.
- **Metricas/Logs**: JSON `{module:"host_ping", mode:"auto"|"msg", container, target_ip, latency_s, ok, ts, ts_iso}`; log opcional `host_ping_auto.txt`.
- **Interpretacao**: RTT numerico; `<0` = erro/timeout; `ok` indica sucesso. Console mostra timestamp, origem->destino, latencia.

### 2.6 IP Header Capture (`netmon.ip_header_capture.IPHeaderCapture`)
- **Proposito**: Rodar `tcpdump` no conteiner para amostrar cabecalhos IP.
- **Entradas/Saidas**: Sem fluxo; loop autonomo.
- **Parametros**: `container_name`, `interface`, `count`, `interval` (s), `filter`, `log_to_file`, `log_dir`.
- **Metricas/Logs**: Sumario de tcpdump no console; log `ip_header_capture_<container>.txt` se habilitado. Sem porta de mensagem.
- **Interpretacao**: Cada linha mostra cabecalho capturado (`timestamp src > dst proto/portas ...`). Ausencia de novas linhas indica que nenhum pacote chegou antes do timeout.

### 2.7 Link Interface Stats (`netmon.link_interface_stats.LinkInterfaceStats`)
- **Proposito**: Consultar `ip -s link` e contadores em `/sys/class/net/*/statistics` dentro do conteiner.
- **Entradas/Saidas**: Sem fluxo; porta `metrics`; thread autonoma.
- **Parametros**: `container_name`, `interval` (s), `log_to_file`, `log_dir`.
- **Metricas/Logs**: Console e arquivo `link_interface_stats_<container>.txt`; JSON `{module:"link_interface_stats", container, ifaces:[{iface, rx_bytes, rx_packets, rx_errors, tx_bytes, tx_packets, tx_errors}], ts, ts_iso}`.
- **Interpretacao**: Contadores por interface; erros !=0 podem indicar perda/congestao; deltas zero indicam ociosidade.

### 2.8 OpenFlow Session Monitor (`netmon.openflow_session.OpenFlowSessionMonitor`)
- **Proposito**: Fotografar o estado da sessao OpenFlow via `ovs-ofctl show` e `ovs-vsctl show` no switch.
- **Entradas/Saidas**: Sem fluxo; porta `metrics`; autonomo.
- **Parametros**: `container_name`, `interval`, `log_to_file`, `log_dir`.
- **Metricas/Logs**: Texto e log `openflow_session_<container>.txt`; JSON `{module:"openflow_session", container, raw, ts, ts_iso}`.
- **Interpretacao**: Verificar `is_connected`, estado das portas, managers configurados. Ausencia de controlador ou portas DOWN sinaliza falha.

### 2.9 PCAP Exporter (`netmon.exporter.PCAPExporter`)
- **Proposito**: Rodar `tcpdump` periodicamente para gerar PCAPs rotativos no conteiner.
- **Entradas/Saidas**: Sem fluxo; loop autonomo.
- **Parametros**: `container_name`, `interface`, `filter`, `pcap_dir` (no conteiner), `file_prefix`, `duration` (s), `interval` (s).
- **Metricas/Logs**: Apenas stdout/stderr do tcpdump; PCAPs gravados em `pcap_dir`.
- **Interpretacao**: Arquivos `file_prefix_<epoch>.pcap` criados a cada intervalo; erros no console denunciam permissoes ou interface invalida.

### 2.10 Transport Stats (`netmon.transport_stats.TransportStats`)
- **Proposito**: Coletar sumarios de transporte via `ss -s` e `/proc/net/snmp` no conteiner.
- **Entradas/Saidas**: Sem fluxo; porta `metrics`; autonomo.
- **Parametros**: `container_name`, `interval`, `log_to_file`, `log_dir`.
- **Metricas/Logs**: Log `transport_stats_<container>.txt`; JSON `{module:"transport_stats", container, snmp:{tcp, udp}, ts, ts_iso}`.
- **Interpretacao**: `ss -s` mostra distribuicao de sockets; SNMP traz contadores `Tcp`/`Udp` (retransmissoes, datagramas, erros). Deltas crescentes em retransmissoes ou erros indicam degradacao.

## 3. Fluxos de Referencia (.grc)
Cada arquivo auto `.grc` executa um unico bloco autonomo com fontes/sumidouros nulos para manter o scheduler e `message_debug` quando aplicavel.

- `netmon_forwarding_table_s1_auto.grc`: Consulta fluxos OVS em `s1`; imprime JSON de metricas e tabela formatada; grava texto se habilitado.
- `netmon_link_interface_stats_auto.grc`: Contadores de interface em `h1` (padrao); log `link_interface_stats_<container>.txt` e JSON por interface.
- `netmon_openflow_session_auto.grc`: Snapshot de sessao OpenFlow em `s1`; log `openflow_session_<container>.txt` e JSON com texto bruto.
- `netmon_transport_stats_auto.grc`: Coleta `ss -s` e SNMP em `h1`; log de transporte e JSON com mapas TCP/UDP.
- `netmon_ip_header_capture_auto.grc`: Amostra cabecalhos via tcpdump em `h1`/`eth0`; log `ip_header_capture_<container>.txt`.
- `netmon_pcap_exporter_auto.grc`: Gera PCAPs rotativos em `h1`; arquivos ficam em `pcap_dir` do conteiner.
- `netmon_alerts_auto.grc`: Varre `host_ping_auto.txt` e gera alertas por limiar.
- `tabela_encaminhamento_S1.grc` / `netmon_forwarding_table_s1_msg_hier.grc`: Variantes hierarquicas/mensagem para snapshots sob `tick`.
- `teste_tabela_encaminhamento.grc`: Harness de teste conectando strobe a `ForwardingTableS1` e `message_debug`.

## 4. Orientacoes de Uso
- **Execucao**: Defina `PYTHONPATH=$(pwd)/gr-netmon/python:$PYTHONPATH` ao rodar a partir do repositório; instalados em `/usr/local/lib/python3.10/dist-packages/netmon`.
- **Conteineres**: Ajuste `container_name`, `interface`, `target_ip` conforme a topologia ativa. Para blocos com tcpdump, confirme binario e permissoes no conteiner.
- **Logs**: Padrao em `${NETMON_LOG_DIR:-$PWD/raw}` (host). PCAPs sao gravados dentro do conteiner em `pcap_dir`.
- **Sinks de mensagem**: Conecte a porta `metrics` a `Message Debug` ou exporte via ZMQ para ver JSON.
- **Desempenho**: Timeouts curtos (<=3 s) evitam travas sem trafego. Ajuste `interval`/`count` para equilibrar granularidade e custo.

## 5. Resumo de Metricas (Consulta Rapida)
- `alerts`: alertas por limiar de latencia/jitter (texto).
- `dns_resolver`: `latency_s`, `ok` por consulta.
- `docker_stats`: CPU%, MemUsage/MemPerc, NetIO, BlockIO por conteiner.
- `forwarding_table_s1`: contadores e deltas por fluxo; bridge.
- `host_ping`: `latency_s` por ping (auto/msg).
- `ip_header_capture`: linhas de cabecalho tcpdump.
- `link_interface_stats`: rx/tx bytes, pacotes, erros por interface.
- `openflow_session`: texto bruto do OVS show/vsctl.
- `pcap_exporter`: arquivos PCAP rotativos.
- `transport_stats`: contadores TCP/UDP parseados de SNMP e sumario `ss -s`.

## 6. Checklist de Validacao
- Conteineres acessiveis via `docker exec` sem prompt.
- Ferramentas presentes: `ping`, `tcpdump`, `ovs-ofctl/ovs-vsctl` (nos switches).
- `log_dir` existe e e gravavel no host.
- `Message Debug` conectado nas portas `metrics` quando desejar inspecionar JSON.

## 7. Registro de Mudancas (relacionado a operacao autonoma)
- Threads de fundo adicionadas aos blocos sem fluxo (alerts, ip_header_capture, link_interface_stats, openflow_session, exporter, transport_stats, forwarding_table_s1) para auto-disparo.
- Timeouts curtos no `IPHeaderCapture` para evitar travas sem trafego.
- Fluxos `.grc` conectam `message_debug` onde ha porta de metricas e usam `throttle/null` para manter o scheduler ativo.

### 2.2 DNS Resolver Monitor (`netmon.dns_resolver.DNSResolverMonitorBlock`)
- **Purpose**: Measure DNS query latency to a configured server/domain.
- **Inputs/Outputs**: Stream out `float32` latency samples; message port `metrics` with JSON.
- **Key Parameters**: `dns_server`, `query_name`, `interval` (s).
- **Metrics/Logs**: JSON payload `{module:"dns_resolver", server, query, latency_s, ok, ts, ts_iso}` each interval; console print of latency or error.

### 2.3 Docker Stats (`netmon.docker_stats.DockerStats`)
- **Purpose**: Poll host `docker stats --no-stream` and emit per-container resource usage.
- **Inputs/Outputs**: No stream I/O; message port `metrics`.
- **Key Parameters**: `containers` filter (comma-separated, empty=all), `interval` (s), `log_to_file` (console print only).
- **Metrics/Logs**: JSON payload `{module:"docker_stats", containers:[{Name, CPUPerc, MemUsage, MemPerc, NetIO, BlockIO}], ts, ts_iso}`.

### 2.4 Forwarding Table S1 (`netmon.forwarding_table_s1.ForwardingTableS1`)
- **Output interpretation (formatted table)**:
  - `Prio`: Rule priority in the OVS pipeline (0 = catch-all). Higher values match before lower ones.
  - `Pkts` / `Bytes`: Cumulative packets/bytes since the rule was installed.
  - `ΔPkt` / `ΔB`: Increment in packets/bytes since the previous poll; a zero delta indicates idle traffic for that rule in the interval.
  - `Actions`: OVS actions (e.g., `NORMAL` for learning-bridge behavior, `output:1`, `drop`).
  - **Snapshot reading**: Presence of only the priority-0 rule with zero deltas indicates no specific policies and no new traffic in the last interval.

- **Output interpretation (text/stream)**:
  - `latency_s`: Round-trip time in seconds for a single ICMP echo inside the container. Values `<0` signal parsing failure/timeouts.
  - `ok`: True when latency is non-negative and ping succeeded; False when ping failed or timed out.
  - Stream output mirrors latency numerically; console lines include timestamp, source container, destination IP, and latency.
- **Variants**:
- **Output interpretation (tcpdump summary)**:
  - Each line corresponds to a captured packet header (timestamp, src > dst, protocol/ports, flags/len when available).
  - Absence of new lines between intervals indicates no packets captured before timeout.
  - Useful to confirm presence of control/data traffic without full payload capture.
- **Key Parameters**: `container_name`, `target_ip`, `interval` (auto), `timeout`, `log_to_file`, `log_dir`.
- **Output interpretation**:
  - Per-interface counters derived from `/sys/class/net/*/statistics`.
  - `rx_bytes/tx_bytes`: Octets received/transmitted since interface up.
  - `rx_packets/tx_packets`: Packet counts.
  - `rx_errors/tx_errors`: Driver-level errors; non-zero deltas may indicate congestion, drops, or driver issues.
  - Stability (no deltas) over an interval indicates idle interfaces; rising errors warrant investigation.

- **Output interpretation**:
  - `ovs-ofctl show`: Lists datapath ID, per-port state, and controller connection status; look for `is_connected: true` or similar indicators.
  - `ovs-vsctl show`: Includes manager/bridge configuration; use to verify controller target and fail-mode.
  - Sudden absence of controller info or ports in `DOWN` state suggests control-plane or data-plane faults.
- **Purpose**: Run `tcpdump` inside a container to sample IP headers periodically.
- **Output interpretation**:
  - For each interval, a PCAP file `file_prefix_<epoch>.pcap` is created in `pcap_dir` inside the container.
  - Console output is minimal (tcpdump stdout/stderr). Empty output with existing files typically indicates success; errors reveal permission or interface issues.
- **Key Parameters**: `container_name`, `interface`, `count` (packets per sample), `interval` (s), `filter` (tcpdump expression), `log_to_file`, `log_dir`.
- **Output interpretation**:
  - Text section `ss -s`: summarises TCP/UDP sockets (established, time-wait, orphaned, etc.).
  - `/proc/net/snmp` parsed fields:
    - `Tcp`: includes `ActiveOpens`, `PassiveOpens`, `CurrEstab`, retransmission counters; rising `RetransSegs` may indicate loss.
    - `Udp`: `InDatagrams`, `NoPorts`, `InErrors`, `OutDatagrams`; non-zero `NoPorts` suggests traffic to unopened UDP ports.
  - JSON exposes the parsed maps for machine processing and delta computation externally.
- **Notes**: Each capture bounded by a short timeout to avoid long hangs when idle traffic.
- **Output interpretation**:
  - Each alert line: `[timestamp] ALERTA: <tipo> <valor> > <limite> em <arquivo>`.
  - Triggered when rolling averages (latência) or rough jitter exceed configured thresholds across last samples.
  - No alert output during idle/healthy periods (silence = within limits).
- **Purpose**: Poll `ip -s link` and `/sys/class/net/*/statistics` inside a container for per-interface counters.
- **Output interpretation**:
  - Stream value: latency in seconds; `-1.0` on resolution failure; `0.0` when idle between intervals.
  - JSON field `ok` false plus `latency_s=-1.0` indicates resolver or reachability failure.
- **Key Parameters**: `container_name`, `interval` (s), `log_to_file`, `log_dir`.
- **Output interpretation**:
  - Fields mirror `docker stats --no-stream`; `CPUPerc` is host-relative CPU %, `MemUsage`/`MemPerc` reflect cgroup-reported memory, `NetIO`/`BlockIO` are cumulative I/O strings.
  - Empty `containers` array means no matching containers or command failure; check daemon accessibility.

### 2.8 OpenFlow Session Monitor (`netmon.openflow_session.OpenFlowSessionMonitor`)
- **Purpose**: Snapshot OpenFlow session state via `ovs-ofctl show` and `ovs-vsctl show` inside a switch container.
- **Inputs/Outputs**: No stream I/O; message port `metrics`; autonomous.
- **Key Parameters**: `container_name`, `interval`, `log_to_file`, `log_dir`.
- **Metrics/Logs**: Text and optional log `openflow_session_<container>.txt`; JSON `{module:"openflow_session", container, raw, ts, ts_iso}`.

### 2.9 PCAP Exporter (`netmon.exporter.PCAPExporter`)
- **Purpose**: Periodically run `tcpdump` inside a container to write rotating PCAP files.
- **Inputs/Outputs**: No stream I/O; autonomous loop.
- **Key Parameters**: `container_name`, `interface`, `filter`, `pcap_dir` (inside container), `file_prefix`, `duration` (s per file), `interval` (s between runs).
- **Metrics/Logs**: Prints tcpdump output/errors to console. PCAP files stored inside the container.

### 2.10 Transport Stats (`netmon.transport_stats.TransportStats`)
- **Purpose**: Collect transport-layer summaries from `ss -s` and `/proc/net/snmp` inside a container.
- **Inputs/Outputs**: No stream I/O; message port `metrics`; autonomous.
- **Key Parameters**: `container_name`, `interval`, `log_to_file`, `log_dir`.
- **Metrics/Logs**: Text log `transport_stats_<container>.txt`; JSON `{module:"transport_stats", container, snmp:{tcp, udp}, ts, ts_iso}` where tcp/udp are parsed counter maps.

## 3. Reference Flow Graphs
Each `.grc` auto file runs a single autonomous block with a dummy null stream (for scheduler) plus `message_debug` where applicable.

- **netmon_forwarding_table_s1_auto.grc**: Periodically dumps OVS flows in container `s1`. Message debug prints `metrics` JSON. Use when monitoring switch rules and packet/byte deltas.
- **netmon_link_interface_stats_auto.grc**: Polls link counters inside `h1` (default). Writes `link_interface_stats_<container>.txt` and emits JSON with per-interface counters.
- **netmon_openflow_session_auto.grc**: Snapshots OpenFlow session state in `s1`. Logs `openflow_session_<container>.txt` and emits raw session text via JSON.
- **netmon_transport_stats_auto.grc**: Collects `ss -s` and `/proc/net/snmp` from `h1`. Logs transport summaries and emits parsed TCP/UDP counters in JSON.
- **netmon_ip_header_capture_auto.grc**: Runs tcpdump in `h1` on `eth0`, sampling `count` packets per interval and writing summaries to `ip_header_capture_<container>.txt`.
- **netmon_pcap_exporter_auto.grc**: Starts rotating PCAP captures inside `h1` (configurable). Files reside in container under `pcap_dir`.
- **netmon_alerts_auto.grc**: Periodically inspects raw ping logs (default `host_ping_auto.txt`) and emits threshold-based alerts to console/file.
- **tabela_encaminhamento_S1.grc / netmon_forwarding_table_s1_msg_hier.grc**: Hierarchical/message variants for interactive tick-driven flow-table snapshots.
- **teste_tabela_encaminhamento.grc**: Example test harness wiring strobe ticks into `ForwardingTableS1` and `message_debug`.

## 4. Usage Guidance
- **Execution**: Set `PYTHONPATH=$(pwd)/gr-netmon/python:$PYTHONPATH` when running locally from the repo; installed copies reside in `/usr/local/lib/python3.10/dist-packages/netmon`.
- **Containers**: Parameters `container_name`, `interface`, `target_ip`, etc., must match the active lab topology. For tcpdump-based blocks, ensure the binary is present in the container and permissions allow capture.
- **Logging**: Host-side logs default to `${NETMON_LOG_DIR:-$PWD/raw}`. Verify directory writable. PCAP files are written inside the container under `pcap_dir`.
- **Message sinks**: To inspect JSON metrics, connect each block’s `metrics` port to a `Message Debug` block in GRC or forward to external collectors (e.g., ZMQ PUB/SUB).
- **Performance considerations**: Capture blocks bound per-interval timeouts (≤3 s) to avoid long hangs when traffic is absent. Adjust `interval` and `count` to balance fidelity and overhead.

## 5. Metrics Summary (Quick Reference)
- `alerts`: threshold crossings on latency/jitter; text only.
- `dns_resolver`: latency_s, ok flag per DNS query.
- `docker_stats`: per-container CPU%, MemUsage, MemPerc, NetIO, BlockIO.
- `forwarding_table_s1`: per-flow packet/byte counters and deltas; bridge name.
- `host_ping`: latency_s per ping, mode auto/msg.
- `ip_header_capture`: tcpdump header lines sampled; text log.
- `link_interface_stats`: rx/tx bytes, packets, errors per interface.
- `openflow_session`: raw OVS show output.
- `pcap_exporter`: rotating PCAP files (no JSON payload).
- `transport_stats`: TCP/UDP counters parsed from /proc/net/snmp and `ss -s` text.

## 6. Validation Checklist
- Containers reachable via `docker exec` (no auth prompts).
- Required tools inside containers: `ping`, `tcpdump`, `ovs-ofctl/ovs-vsctl` (for switch nodes).
- `log_dir` exists and is writable on host.
- Message debug blocks attached to `metrics` ports when interactive inspection is desired.

## 7. Change Log (relevant to autonomous operation)
- Added background threads to non-stream blocks (alerts, ip_header_capture, link_interface_stats, openflow_session, exporter, transport_stats, forwarding_table_s1) to self-trigger without upstream streams.
- Bounded tcpdump timeouts in `IPHeaderCapture` to avoid long hangs when traffic is idle.
- Flow graphs include `message_debug` connections for metrics where applicable and `throttle/null` pairs for scheduler keepalive.
