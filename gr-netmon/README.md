# gr-netmon

GNU Radio OOT module with ready-to-use monitoring blocks and example flowgraphs for SDN/container labs.

## O que é essencial (conteúdo da pasta)
- Código dos blocos: `python/netmon/*.py`
- Definições de blocos GRC: `grc/blocks/*.block.yml`
- Flowgraphs de exemplo: `grc/flows/*.grc`
- Arquivos CMake: `CMakeLists.txt` (raiz, `grc/`, `python/`)
- Documentação: este `README.md` e `NETMON_DOC_IEEE.md`
- `.gitignore` para excluir builds, caches e logs
- (Opcional) `build/` é gerado localmente e não precisa ser distribuído.

Tudo que o usuário precisa para instalar e usar no GNU Radio está dentro de `gr-netmon/`. O script `run_netmon_master.py` fora da pasta é opcional e apenas empacota alguns blocos em modo autônomo.

## Pré-requisitos
- GNU Radio 3.10+
- Python 3.8+
- Docker disponível no host; dentro dos contêineres, instale as ferramentas necessárias por bloco: `ping`, `iproute2` (ip), `ss`, `tcpdump`, `openvswitch-common` (ovs-ofctl/ovs-vsctl) para o switch.
- Dependência Python: `pip install dnspython` (para o bloco DNS).

## Instalação (CMake — recomendado)
```bash
cd gr-netmon
mkdir -p build && cd build
cmake ..
make
sudo make install
```
Após instalar, os blocos aparecem no GRC em `[Network]/Monitoring`.

## Instalação manual (somente se não usar CMake)
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

## Paths e logs
- `log_dir` padrão: `${NETMON_LOG_DIR:-$PWD/raw}`. O diretório é criado automaticamente.
- Para mudar o destino de logs/pcaps, defina `NETMON_LOG_DIR` antes de iniciar o GRC ou configure o parâmetro `log_dir` no bloco.

## Como usar os blocos (GRC)
- Abra o GRC e procure em `[Network]/Monitoring`.
- Arraste o bloco desejado, configure parâmetros e (quando houver) conecte a porta `metrics` a um `Message Debug` para ver JSON.
- Blocos principais:
	- `HostPingAuto`: ping periódico em contêiner. Params: `container_name`, `target_ip`, `interval`, `timeout`, `log_to_file`, `log_dir`. Saída: stream float (latência) + JSON em `metrics`.
	- `HostPingMsg`: ping sob demanda ao receber mensagem `tick`; responde texto em `out` e JSON em `metrics`.
	- `LinkInterfaceStats`: coleta `ip -s link` e estatísticas de `/sys/class/net/*/statistics`. Params: `container_name`, `interval`, `log_to_file`, `log_dir`. Saída: JSON por interface em `metrics` e log opcional.
	- `TransportStats`: coleta `ss -s` e `/proc/net/snmp`. Params: `container_name`, `interval`, `log_to_file`, `log_dir`. Saída: JSON com mapas TCP/UDP.
	- `ForwardingTableS1`: dump de fluxos OVS. Params: `container_name`, `update_interval`, `bridge_override`, `log_to_file`, `log_dir`, `auto_start`. Porta `tick` dispara manualmente; `out` texto, `metrics` JSON.
	- `OpenFlowSessionMonitor`: `ovs-ofctl show` + `ovs-vsctl show`. Params: `container_name`, `interval`, `log_to_file`, `log_dir`. Saída: JSON com texto bruto.
	- `IPHeaderCapture`: amostra cabeçalhos via `tcpdump`. Params: `container_name`, `interface`, `count`, `interval`, `filter`, `log_to_file`, `log_dir`. Saída: log texto.
	- `PCAPExporter`: grava PCAP rotativo no contêiner. Params: `container_name`, `interface`, `filter`, `pcap_dir`, `file_prefix`, `duration`, `interval`.
	- `DNSResolverMonitorBlock`: mede latência DNS. Params: `dns_server`, `query_name`, `interval`. Saída: stream float + JSON `metrics`.
	- `DockerStats`: coleta `docker stats --no-stream`. Params: `containers` (filtro), `interval`, `log_to_file`. Saída: JSON `metrics`.

## Flowgraphs prontos (`grc/flows`)
- `netmon_link_interface_stats_auto.grc`: contadores de interface em contêiner (default h1).
- `netmon_transport_stats_auto.grc`: estatísticas de transporte em contêiner (default h1).
- `netmon_openflow_session_auto.grc`: sessão OpenFlow no switch (default s1).
- `netmon_forwarding_table_s1_auto.grc`: tabela de fluxos OVS (s1), auto-run.
- `netmon_forwarding_table_s1_msg_hier.grc`: versão hierárquica com tick por mensagem.
- `netmon_ip_header_capture_auto.grc`: amostra cabeçalhos IP (tcpdump) em h1/eth0.
- `netmon_pcap_exporter_auto.grc`: captura PCAP rotativa em contêiner.
- `netmon_alerts_auto.grc`: lê `host_ping_auto.txt` e gera alertas.
- `netmon_alerts_auto`/`host_ping`/`transport` flows usam `./raw` por padrão; ajuste `log_dir` se quiser outro caminho.

Execução dos flows: abra no GRC, ajuste parâmetros, confirme `log_dir`, clique Play. Veja JSON via `Message Debug` ou arquivos em `raw/`.

## Uso em Python (fora do GRC)
```bash
python3 - <<'PY'
import time
from netmon.link_interface_stats import LinkInterfaceStats
blk = LinkInterfaceStats(container_name="h1", interval=1.0, log_to_file=True, log_dir="./raw")
for _ in range(2):
		blk.work([], []); time.sleep(1.0)
blk.stop()
PY
```

## JSON `metrics` (esquema comum)
Cada publicação traz pelo menos:
```json
{
	"ts": 1734300000.0,
	"ts_iso": "2025-12-16T12:00:00",
	"module": "<block_id>",
	"container": "h1"
}
```
Campos adicionais dependem do bloco (latency_s, flows, ifaces, snmp, containers, etc.).

## Dicas e troubleshooting
- Se nenhum log aparecer: verifique `log_to_file=True` e se `log_dir` é gravável.
- `tcpdump` sem tráfego pode esperar até o timeout; reduza `count` ou aumente `interval`.
- Para OVS: confirme `docker exec s1 ovs-vsctl list-br` e `ovs-ofctl show s1` dentro do contêiner.
- `NETMON_LOG_DIR` pode ser usado para centralizar logs fora da pasta do projeto.

## Opcional: execução autonoma
O script `run_netmon_master.py` (fora de `gr-netmon/`) instancia alguns blocos em modo autônomo. Ele não é necessário para usar os blocos ou flows; serve apenas como exemplo rápido.
