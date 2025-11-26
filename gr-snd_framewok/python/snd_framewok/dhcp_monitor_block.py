"""
DHCP Monitor Block
Captura DHCP Discover/Offer/Request/ACK, constrói tabela de leases.
"""
from gnuradio import gr

class DHCPMonitorBlock(gr.basic_block):
    """
    GNU Radio EPY Block: DHCP Monitor
    Args:
        iface (str): Interface de rede
    """
    def __init__(self, iface='eth0'):
        gr.basic_block.__init__(self,
            name="DHCP Monitor Block",
            in_sig=[],
            out_sig=[])
        self.iface = iface

    def start(self):
        # Inicia captura DHCP
        pass
