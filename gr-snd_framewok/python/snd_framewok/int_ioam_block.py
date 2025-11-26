"""
In-Band Network Telemetry (INT/IOAM) Block
Captura e decodifica metadados INT: latência, fila, timestamp, next-hop.
"""
from gnuradio import gr

class INTIOAMBlock(gr.basic_block):
    """
    GNU Radio EPY Block: INT/IOAM
    Args:
        iface (str): Interface de rede
    """
    def __init__(self, iface='eth0'):
        gr.basic_block.__init__(self,
            name="INT/IOAM Block",
            in_sig=[],
            out_sig=[])
        self.iface = iface

    def start(self):
        # Captura INT/IOAM
        pass
