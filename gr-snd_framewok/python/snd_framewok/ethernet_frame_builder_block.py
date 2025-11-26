"""
Ethernet Frame Builder Block
Constrói quadros Ethernet completos para envio/experimentos.
"""
from gnuradio import gr
import struct

class EthernetFrameBuilderBlock(gr.basic_block):
    """
    GNU Radio EPY Block: Ethernet Frame Builder
    Args:
        src_mac (str): MAC de origem
        dst_mac (str): MAC de destino
        ethertype (int): EtherType
    """
    def __init__(self, src_mac, dst_mac, ethertype=0x0800):
        gr.basic_block.__init__(self,
            name="Ethernet Frame Builder Block",
            in_sig=[],
            out_sig=[])
        self.src_mac = src_mac
        self.dst_mac = dst_mac
        self.ethertype = ethertype

    def build_frame(self, payload):
        # Constrói quadro Ethernet
        pass
