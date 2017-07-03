from hwt.hdlObjects.assignment import Assignment
from hwt.hdlObjects.entity import Entity
from hwt.hdlObjects.types.array import Array
from hwt.hdlObjects.types.enum import Enum
from hwt.hdlObjects.variables import SignalItem
from hwt.pyUtils.arrayQuery import groupedby
from hwt.serializer.exceptions import SerializerException
from hwt.serializer.serializerClases.base import SerializerBase
from hwt.serializer.serializerClases.context import SerializerCtx
from hwt.serializer.serializerClases.indent import getIndent
from hwt.serializer.serializerClases.mapExpr import MapExpr
from hwt.serializer.serializerClases.nameScope import LangueKeyword, NameScope
from hwt.serializer.serializerClases.portMap import PortMap
from hwt.serializer.utils import maxStmId
from hwt.serializer.vhdl.keywords import VHLD_KEYWORDS
from hwt.serializer.vhdl.ops import VhdlSerializer_ops
from hwt.serializer.vhdl.statements import VhdlSerializer_statements
from hwt.serializer.vhdl.tmplContainer import VhdlTmplContainer
from hwt.serializer.vhdl.types import VhdlSerializer_types
from hwt.serializer.vhdl.utils import VhdlVersion
from hwt.serializer.vhdl.value import VhdlSerializer_Value
from hwt.synthesizer.param import getParam


class DebugTmpVarStack():
    def __init__(self):
        """
        :ivar vars: list of serialized variable declarations
        """
        self.vars = []
        self.serializer = VhdlSerializer
    
    def createTmpVarFn(self, suggestedName, dtype):
        # [TODO] it is better to use RtlSignal
        ser = self.serializer

        s = SignalItem(suggestedName, dtype, virtualOnly=True)
        s.hidden = False
        serializedS = ser.SignalItem(s, self.createTmpVarFn, declaration=True)
        self.vars.append((serializedS, s))
        
        return s
    
    def _serializeItem(self, item):
        var, s = item
        # assignemt of value for this tmp variable
        a = Assignment(s.defaultVal, s, virtualOnly=True)
        return "%s\n%s" % (var, self.serializer.Assignment(a, self.createTmpVarFn))
    
    def serialize(self, indent=0):
        if not self.vars:
            return ""
        
        separator = getIndent(indent) + "\n"
        return separator.join(map(self._serializeItem, self.vars)) + "\n"


class VhdlSerializer(SerializerBase, VhdlTmplContainer, VhdlSerializer_Value, 
                     VhdlSerializer_ops, VhdlSerializer_types, VhdlSerializer_statements):
    VHDL_VER = VhdlVersion.v2002
    _keywords_dict = {kw: LangueKeyword() for kw in VHLD_KEYWORDS}
    fileExtension = '.vhd'

    @classmethod
    def getBaseNameScope(cls):
        s = NameScope(True)
        s.setLevel(1)
        s[0].update(cls._keywords_dict)
        return s
    
    @classmethod
    def getBaseContext(cls):
        return SerializerCtx(cls.getBaseNameScope(), 0, None, None)

    @classmethod
    def Architecture(cls, arch, ctx):
        variables = []
        procs = []
        extraTypes = set()
        extraTypes_serialized = []
        arch.variables.sort(key=lambda x: x.name)
        arch.processes.sort(key=lambda x: (x.name, maxStmId(x)))
        arch.components.sort(key=lambda x: x.name)
        arch.componentInstances.sort(key=lambda x: x._name)

        def createTmpVarFn(suggestedName, dtype):
            raise NotImplementedError()

        childCtx = ctx.withIndent()
        childCtx.createTmpVarFn = createTmpVarFn

        for v in arch.variables:
            t = v._dtype
            # if type requires extra definition
            if isinstance(t, (Enum, Array)) and t not in extraTypes:
                extraTypes.add(v._dtype)
                extraTypes_serialized.append(cls.HdlType(t, childCtx, declaration=True))

            v.name = ctx.scope.checkedName(v.name, v)
            serializedVar = cls.SignalItem(v, childCtx, declaration=True)
            variables.append(serializedVar)

        for p in arch.processes:
            procs.append(cls.HWProcess(p, childCtx))

        # architecture names can be same for different entities
        # arch.name = scope.checkedName(arch.name, arch, isGlobal=True)

        uniqComponents = list(map(lambda x: x[1][0], groupedby(arch.components, lambda c: c.name)))
        uniqComponents.sort(key=lambda c: c.name)
        components = list(map(lambda c: cls.Component(c, childCtx),
                              uniqComponents))

        componentInstances = list(map(lambda c: cls.ComponentInstance(c, childCtx),
                                      arch.componentInstances))

        return cls.architectureTmpl.render(
            indent=getIndent(ctx.indent),
            entityName=arch.getEntityName(),
            name=arch.name,
            variables=variables,
            extraTypes=extraTypes_serialized,
            processes=procs,
            components=components,
            componentInstances=componentInstances
            )

    @classmethod
    def comment(cls, comentStr):
        return "--" + comentStr.replace("\n", "\n--")

    @classmethod
    def Component(cls, entity, ctx):
        entity.ports.sort(key=lambda x: x.name)
        entity.generics.sort(key=lambda x: x.name)
        return cls.componentTmpl.render(
                indent=getIndent(ctx.indent),
                ports=[cls.PortItem(pi, ctx) for pi in entity.ports],
                generics=[cls.GenericItem(g, ctx) for g in entity.generics],
                entity=entity
                )

    @classmethod
    def ComponentInstance(cls, entity, ctx):
        portMaps = []
        for pi in entity.ports:
            pm = PortMap.fromPortItem(pi)
            portMaps.append(pm)

        genericMaps = []
        for g in entity.generics:
            gm = MapExpr(g, g._val)
            genericMaps.append(gm)

        if len(portMaps) == 0:
            raise Exception("Incomplete component instance")

        # [TODO] check component instance name
        return cls.componentInstanceTmpl.render(
                indent=getIndent(ctx.indent),
                instanceName=entity._name,
                entity=entity,
                portMaps=[cls.PortConnection(x, ctx) for x in portMaps],
                genericMaps=[cls.MapExpr(x, ctx) for x in genericMaps]
                )

    @classmethod
    def Entity(cls, ent, ctx):
        ports = []
        generics = []
        ent.ports.sort(key=lambda x: x.name)
        ent.generics.sort(key=lambda x: x.name)

        def createTmpVarFn(suggestedName, dtype):
            raise NotImplementedError()

        scope = ctx.scope
        ent.name = scope.checkedName(ent.name, ent, isGlobal=True)
        for p in ent.ports:
            p.name = scope.checkedName(p.name, p)
            ports.append(cls.PortItem(p, createTmpVarFn))

        for g in ent.generics:
            g.name = scope.checkedName(g.name, g)
            generics.append(cls.GenericItem(g, createTmpVarFn))

        entVhdl = cls.entityTmpl.render(
                indent=getIndent(ctx.indent),
                name=ent.name,
                ports=ports,
                generics=generics
                )

        doc = ent.__doc__
        if doc and id(doc) != id(Entity.__doc__):
            doc = cls.comment(doc) + "\n"
            return doc + entVhdl
        else:
            return entVhdl

    @classmethod
    def GenericItem(cls, g, ctx):
        s = "%s : %s" % (g.name, cls.HdlType(g._dtype, ctx))
        if g.defaultVal is None:
            return s
        else:
            return "%s := %s" % (s, cls.Value(getParam(g.defaultVal).staticEval(), ctx))

    @classmethod
    def PortConnection(cls, pc, ctx):
        if pc.portItem._dtype != pc.sig._dtype:
            raise SerializerException("Port map %s is nod valid (types does not match)  (%s, %s)" % (
                      "%s => %s" % (pc.portItem.name, cls.asHdl(pc.sig, ctx)),
                      repr(pc.portItem._dtype), repr(pc.sig._dtype)))
        return " %s => %s" % (pc.portItem.name, cls.asHdl(pc.sig, ctx))

    @classmethod
    def DIRECTION(cls, d):
        return d.name

    @classmethod
    def PortItem(cls, pi, ctx):
        return "%s : %s %s" % (pi.name, cls.DIRECTION(pi.direction),
                               cls.HdlType(pi._dtype, ctx))

    @classmethod
    def MapExpr(cls, m, ctx):
        return "%s => %s" % (m.compSig.name, cls.asHdl(m.value, ctx))