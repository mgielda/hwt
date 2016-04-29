from hdl_toolkit.intfLvl import UnitFromHdl

class AxiLiteBasicSlave(UnitFromHdl):
    _hdlSources = "vhdl/axiLite_basic_slave.vhd"
    
if __name__ == "__main__":
    u = AxiLiteBasicSlave()
    u._loadDeclarations()
    print(u)
    