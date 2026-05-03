#!/bin/bash

OUTPUT_DIR="/home/jon/Downloads/Experimento_manual"
RUNS=8
DURATION=60   # 2 minutos
INTERVAL=1

mkdir -p "$OUTPUT_DIR"

# Funções para coletar as métricas

get_cpu_pct() {
    docker stats --no-stream --format "{{.CPUPerc}}" s1 | sed 's/%//'
}

get_ram_used_pct() {
    docker stats --no-stream --format "{{.MemPerc}}" s1 | sed 's/%//'
}

get_dns_resolve_ms() {
    START=$(date +%s%N)
    nslookup google.com > /dev/null 2>&1
    END=$(date +%s%N)
    echo "scale=3; ($END - $START)/1000000" | bc
}

get_tcp_retrans_pct() {
    ss -s | grep retrans | awk '{print $1}' | head -n1
}

get_sessions_established() {
    ss -s | grep estab | awk '{print $4}'
}

get_route_count() {
    ip route | wc -l
}

get_if_link_up() {
    ip link show | grep "state UP" | wc -l
}

get_mac_table_size() {
    ip neigh | wc -l
}

get_tls_handshake_latency() {
    START=$(date +%s%N)
    echo | openssl s_client -connect google.com:443 2>/dev/null | grep -q "CONNECTED"
    END=$(date +%s%N)
    echo "scale=3; ($END - $START)/1000000" | bc
}

get_e2e_path_availability() {
    ping -c1 -W1 8.8.8.8 > /dev/null 2>&1
    if [ $? -eq 0 ]; then echo 1; else echo 0; fi
}

# Função principal para rodar as execuções
for ((run=1; run<=RUNS; run++)); do
    FILE="$OUTPUT_DIR/run_${run}.txt"
    echo "Iniciando execução $run..."

    START_TIME=$(date +%s)

    while [ $(($(date +%s) - START_TIME)) -lt $DURATION ]; do
        TS=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

        echo "ts \"$TS\"" >> $FILE
        echo -e "cpu_pct\t$(get_cpu_pct)" >> $FILE
        echo -e "ram_used_pct\t$(get_ram_used_pct)" >> $FILE
        echo -e "dns_resolve_ms\t$(get_dns_resolve_ms)" >> $FILE
        echo -e "e2e_path_availability\t$(get_e2e_path_availability)" >> $FILE
        echo -e "if_link_up\t$(get_if_link_up)" >> $FILE
        echo -e "mac_table_size\t$(get_mac_table_size)" >> $FILE
        echo -e "route_count\t$(get_route_count)" >> $FILE
        echo -e "sessions_established\t$(get_sessions_established)" >> $FILE
        echo -e "tcp_retrans_pct\t$(get_tcp_retrans_pct)" >> $FILE
        echo -e "tls_handshake_latency\t$(get_tls_handshake_latency)" >> $FILE
        echo "" >> $FILE

        sleep $INTERVAL
    done

    echo "Execução $run finalizada."
done

echo "Coleta concluída!"
