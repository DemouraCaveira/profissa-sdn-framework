"""
IP Packet Sniffer Block
Captura pacotes IP/TCP/UDP com filtros configuráveis.
"""
from gnuradio import gr
import socket

class IPPacketSnifferBlock(gr.basic_block):
    """
    GNU Radio EPY Block: IP Packet Sniffer
    Args:
        iface (str): Interface de rede
        bpf_filter (str): Filtro BPF
    """
    def __init__(self, iface='eth0', bpf_filter='ip'):
        gr.basic_block.__init__(self,
            name="IP Packet Sniffer Block",
            in_sig=[],
            out_sig=[])
        self.iface = iface
        self.bpf_filter = bpf_filter

    def start(self):
        # Inicia captura
        pass

    def stop(self):
        # Finaliza captura
        pass
