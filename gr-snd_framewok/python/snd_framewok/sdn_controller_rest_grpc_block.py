"""
SDN Controller REST/GRPC Block
Integra com RYU, ONOS, OpenDaylight, P4Runtime.
"""
from gnuradio import gr
import requests

class SDNControllerRESTGRPCBlock(gr.basic_block):
    """
    GNU Radio EPY Block: SDN Controller REST/GRPC
    Args:
        controller_url (str): URL do controlador
        api_type (str): 'rest' ou 'grpc'
    """
    def __init__(self, controller_url, api_type='rest'):
        gr.basic_block.__init__(self,
            name="SDN Controller REST/GRPC Block",
            in_sig=[],
            out_sig=[])
        self.controller_url = controller_url
        self.api_type = api_type

    def start(self):
        # Integra com controlador SDN
        pass
