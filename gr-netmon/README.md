# gr-netmon

Módulo OOT do GNU Radio com blocos de monitoramento prontos para SDN e laboratórios com contêineres. Inclui flowgraphs de exemplo e documentação para instalação rápida.

## Estrutura do repositório
- Código dos blocos: `python/netmon/*.py`
- Definições GRC: `grc/blocks/*.block.yml`
- Flowgraphs de exemplo: `grc/flows/*.grc`
- Arquivos CMake: `CMakeLists.txt` (raiz, `grc/`, `python/`)
- Documentação: `README.md`
- Auxiliar: `.gitignore` para builds, caches e logs
- Gerados localmente: `build/` (não precisa ser distribuído)

O diretório `gr-netmon/` contém tudo que é necessário para uso no GNU Radio. O script opcional `run_netmon_master.py`, fora da pasta, apenas empacota alguns blocos em modo autônomo.

## Requisitos
- GNU Radio 3.10+
- Python 3.8+
- Docker disponível no host
- Utilitários nos contêineres conforme o bloco: `ping`, `iproute2` (ip), `ss`, `tcpdump`, `openvswitch-common` (ovs-ofctl/ovs-vsctl)
- Dependência Python: `pip install dnspython` (para o bloco de DNS)

## Instalação recomendada (CMake)
```bash
cd gr-netmon
mkdir -p build && cd build
cmake ..
make
sudo make install
```
Após instalar, os blocos aparecem no GRC em `[Network]/Monitoring`.

## Instalação manual (sem CMake)
```bash
ROOT=$(pwd)  # diretório onde está gr-netmon
PYVER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
SITE=/usr/local/lib/python${PYVER}/dist-packages
GRCB=/usr/local/share/gnuradio/grc/blocks
GRCF=/usr/local/share/gnuradio/grc/examples

sudo mkdir -p "$SITE" "$GRCB" "$GRCF"
sudo cp -r "$ROOT/gr-netmon/python/netmon" "$SITE/"
sudo find "$SITE/netmon" -name '__pycache__' -type d -exec rm -rf {} +
sudo cp -f "$ROOT/gr-netmon/grc/blocks"/*.block.yml "$GRCB/"
sudo cp -f "$ROOT/gr-netmon/grc/flows"/netmon_*.grc "$GRCF/"
```

## Uso rápido no GRC
1. Abra o GRC e localize `[Network]/Monitoring`.
2. Arraste o bloco, configure parâmetros e conecte `metrics` a um `Message Debug` para ver JSON.
3. Ajuste `log_dir` se quiser salvar logs/pcaps fora de `./raw`.

## Blocos principais
- `HostPingAuto`: ping periódico em contêiner. Params: `container_name`, `target_ip`, `interval`, `timeout`, `log_to_file`, `log_dir`. Saída: stream float de latência + JSON em `metrics`.
- `HostPingMsg`: ping sob demanda após mensagem `tick`; saída texto em `out` e JSON em `metrics`.
- `LinkInterfaceStats`: coleta `ip -s link` e `/sys/class/net/*/statistics`. Params: `container_name`, `interval`, `log_to_file`, `log_dir`. Saída: JSON por interface e log opcional.
- `TransportStats`: coleta `ss -s` e `/proc/net/snmp`. Params: `container_name`, `interval`, `log_to_file`, `log_dir`. Saída: JSON com mapas TCP/UDP.
- `ForwardingTableS1`: dump de fluxos OVS. Params: `container_name`, `update_interval`, `bridge_override`, `log_to_file`, `log_dir`, `auto_start`. `tick` dispara coleta manual; `out` texto, `metrics` JSON.
- `OpenFlowSessionMonitor`: `ovs-ofctl show` + `ovs-vsctl show`. Params: `container_name`, `interval`, `log_to_file`, `log_dir`. Saída: JSON com texto bruto.
- `IPHeaderCapture`: amostra cabeçalhos via `tcpdump`. Params: `container_name`, `interface`, `count`, `interval`, `filter`, `log_to_file`, `log_dir`. Saída: log texto.
- `PCAPExporter`: grava PCAP rotativo. Params: `container_name`, `interface`, `filter`, `pcap_dir`, `file_prefix`, `duration`, `interval`.
- `DNSResolverMonitorBlock`: mede latência DNS. Params: `dns_server`, `query_name`, `interval`. Saída: stream float + JSON `metrics`.
- `DockerStats`: coleta `docker stats --no-stream`. Params: `containers` (filtro), `interval`, `log_to_file`. Saída: JSON `metrics`.

## Flowgraphs prontos (`grc/flows`)
- `netmon_link_interface_stats_auto.grc`: contadores de interface em contêiner (default h1).
- `netmon_transport_stats_auto.grc`: estatísticas de transporte em contêiner (default h1).
- `netmon_openflow_session_auto.grc`: sessão OpenFlow no switch (default s1).
- `netmon_forwarding_table_s1_auto.grc`: tabela de fluxos OVS (s1), auto-run.
- `netmon_forwarding_table_s1_msg_hier.grc`: versão hierárquica com `tick` por mensagem.
- `netmon_ip_header_capture_auto.grc`: amostra cabeçalhos IP (tcpdump) em h1/eth0.
- `netmon_pcap_exporter_auto.grc`: captura PCAP rotativa em contêiner.
- `netmon_alerts_auto.grc`: lê `host_ping_auto.txt` e gera alertas.
- Flows de alerts/host_ping/transport usam `./raw` por padrão; ajuste `log_dir` se necessário.

Para executar: abra o flow no GRC, ajuste parâmetros, confirme `log_dir`, clique Play e visualize JSON via `Message Debug` ou arquivos em `raw/`.

## Logs e variáveis de ambiente
- `log_dir` padrão: `${NETMON_LOG_DIR:-$PWD/raw}`; criado automaticamente se não existir.
- Para centralizar logs/pcaps, defina `NETMON_LOG_DIR` antes de iniciar o GRC ou configure `log_dir` nos blocos.

## Uso em Python (fora do GRC)
```bash
python3 - <<'PY'
import time
from netmon.link_interface_stats import LinkInterfaceStats

blk = LinkInterfaceStats(container_name="h1", interval=1.0, log_to_file=True, log_dir="./raw")
for _ in range(2):
	blk.work([], [])
	time.sleep(1.0)
blk.stop()
PY
```

## Estrutura de `metrics` (JSON)
Cada publicação inclui pelo menos:
```json
{
  "ts": 1734300000.0,
  "ts_iso": "2025-12-16T12:00:00",
  "module": "<block_id>",
  "container": "h1"
}
```
Campos adicionais variam por bloco (`latency_s`, `flows`, `ifaces`, `snmp`, `containers`, etc.).

## Dicas de operação
- Sem logs? Verifique `log_to_file=True` e permissões de escrita em `log_dir`.
- `tcpdump` pode aguardar tráfego; reduza `count` ou aumente `interval` se necessário.
- Para OVS, valide dentro do contêiner: `docker exec s1 ovs-vsctl list-br` e `ovs-ofctl show s1`.
- Use `NETMON_LOG_DIR` para direcionar logs fora da pasta do projeto.

## Execução autônoma (opcional)
`run_netmon_master.py` (fora de `gr-netmon/`) instancia alguns blocos em modo autônomo. Não é necessário para uso no GRC, serve apenas como exemplo rápido.
