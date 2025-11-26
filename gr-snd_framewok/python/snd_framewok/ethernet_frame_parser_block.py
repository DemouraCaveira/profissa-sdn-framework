"""
Ethernet Frame Parser Block
Extrai cabeçalhos, endereços MAC, EtherType, payload.
"""
from gnuradio import gr
import struct

class EthernetFrameParserBlock(gr.basic_block):
    """
    GNU Radio EPY Block: Ethernet Frame Parser
    Args:
        iface (str): Interface de rede
    """
    def __init__(self, iface='eth0'):
        gr.basic_block.__init__(self,
            name="Ethernet Frame Parser Block",
            in_sig=[],
            out_sig=[])
        self.iface = iface

    def parse_frame(self, frame):
        # Extrai MAC, EtherType, payload
        pass
