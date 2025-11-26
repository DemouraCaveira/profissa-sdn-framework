"""
OVSDB Client Block
Conecta diretamente ao banco OVSDB do switch.
"""
from gnuradio import gr

class OVSDBClientBlock(gr.basic_block):
    """
    GNU Radio EPY Block: OVSDB Client
    Args:
        ovsdb_addr (str): Endereço OVSDB
    """
    def __init__(self, ovsdb_addr='tcp:127.0.0.1:6640'):
        gr.basic_block.__init__(self,
            name="OVSDB Client Block",
            in_sig=[],
            out_sig=[])
        self.ovsdb_addr = ovsdb_addr

    def start(self):
        # Conecta ao OVSDB
        pass
