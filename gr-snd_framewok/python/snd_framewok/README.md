# Catálogo de EPY Blocks para GNU Radio

Esta pasta contém um catálogo completo de Embedded Python Blocks (EPY Blocks) para experimentos em redes, SDN, virtualização, transporte, aplicação, controle e visualização. Cada script é um módulo pronto para uso no GNU Radio, parametrizável e com estrutura profissional.

## Como utilizar

1. **Importe o bloco desejado no seu projeto GNU Radio (GRC ou Python).**
2. **Instancie o bloco passando os parâmetros necessários (ex: IP, interface, porta, etc).**
3. **Conecte os blocos conforme o fluxo do seu experimento.**
4. **Consulte os métodos e parâmetros de cada bloco para customização.**

Exemplo de uso em Python:
```python
from epy_blocks.udp_receiver_jitter_analyzer_block import UDPReceiverJitterAnalyzerBlock
block = UDPReceiverJitterAnalyzerBlock(iface='eth0', listen_port=5000)
```

---

## Descrição dos scripts

### Camada 1/2 — Física & Enlace
- **arp_monitor_block.py**: Captura ARP, detecta hosts, conflitos, atualiza tabela ARP.
- **ethernet_frame_parser_block.py**: Extrai cabeçalhos, endereços MAC, EtherType, payload.
- **ethernet_frame_builder_block.py**: Constrói quadros Ethernet completos para envio/experimentos.
- **wifi_management_frame_monitor_block.py**: Captura frames de gerenciamento WiFi (beacons, probe requests, reassociação).

### Camada 3 — Rede (IP, Roteamento, ICMP)
- **icmp_probe_block.py**: Gera pings, mede RTT, jitter, perda.
- **ip_packet_sniffer_block.py**: Captura pacotes IP/TCP/UDP com filtros configuráveis.
- **fib_rib_monitor_block.py**: Lê tabelas de encaminhamento (Linux, OVS, FRR/BGP/OSPF).
- **ip_flow_monitor_block.py**: Conta fluxos IP, mudanças, timeouts, direções, bytes.

### Camada 4 — Transporte
- **tcp_flow_analyzer_block.py**: Mede congestion window, retransmissões, throughput, RTT, estado da conexão TCP.
- **udp_traffic_generator_block.py**: Gera tráfego UDP com taxa configurável.
- **udp_receiver_jitter_analyzer_block.py**: Mede jitter, perda, variação temporal.
- **quic_probe_metrics_block.py**: Analisa conexões QUIC (RTT, handshake, perda, fluxos).

### Camadas 5/6/7 — Sessão, Apresentação e Aplicação
- **dns_resolver_monitor_block.py**: Consulta DNS, mede tempo de resposta, detecta falhas.
- **dhcp_monitor_block.py**: Captura DHCP Discover/Offer/Request/ACK, constrói tabela de leases.
- **http_rest_client_block.py**: Executa requisições REST para APIs externas.
- **json_xml_parser_block.py**: Padroniza a interpretação de dados retornados por APIs (JSON/XML).

### Controle, SDN e Telemetria
- **sdn_controller_rest_grpc_block.py**: Integra com controladores SDN (RYU, ONOS, OpenDaylight, P4Runtime) via REST/GRPC.
- **ovs_flow_table_monitor_block.py**: Monitora tabela de fluxos OVS (ovs-ofctl dump-flows).
- **int_ioam_block.py**: Captura e decodifica metadados INT/IOAM (latência, fila, timestamp, next-hop).
- **link_failure_recovery_detector_block.py**: Detecta quedas de interface, monitoramento de portas, métricas de enlace.

### Virtualização e Ambientes de Experimentos
- **docker_node_monitor_block.py**: Extrai métricas de containers Docker/ContainerLab (CPU, memória, rede, logs, estado).
- **mininet_control_block.py**: Executa comandos Mininet direto do GNU Radio (ping, iperf, ifconfig, dump de topologia).
- **ovsdb_client_block.py**: Conecta diretamente ao banco OVSDB do switch.

### SDR + Redes (Avançado)
- **rf_metrics_network_link_mapper_block.py**: Mapeia SNR/BER para métricas de rede (QoS, custo, weight).
- **adaptive_routing_trigger_block.py**: Dispara evento para o controlador SDN quando SNR cai.
- **mobility_event_generator_block.py**: Simula movimento (handovers, alterações de enlace, latência variável).

### Visualização, Log e Análise
- **network_metrics_logger_block.py**: Salva dados de rede (RTT, jitter, flows, FIB) em CSV, JSON ou Prometheus.
- **experiment_timeline_scenario_block.py**: Permite definir cenários experimentais (derrubar link, mudar rota, gerar tráfego UDP).
- **topology_visualizer_block.py**: Desenha a topologia e muda cores conforme estado.

---

## Observações
- Todos os blocos são parametrizáveis e podem ser usados separadamente ou em conjunto.
- Consulte o docstring de cada script para detalhes de parâmetros e métodos.
- Para integração com GNU Radio Companion (GRC), utilize o Embedded Python Block e aponte para o script desejado.
- Para dúvidas ou exemplos de uso, consulte os comentários nos scripts ou solicite exemplos específicos.
