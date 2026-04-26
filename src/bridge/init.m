Needs["CodeParser`"]

normalizeSource[source_] /; MatchQ[source, {{_Integer, _Integer}, {_Integer, _Integer}}] := source
normalizeSource[_] := Missing["NotAvailable"]

nodeSource[expr_] :=
	Module[{meta, source},
		meta = Quiet @ Check[expr[[-1]], Missing["NotAvailable"]];
		source = Quiet @ Check[meta[CodeParser`Source], Missing["NotAvailable"]];
		normalizeSource[source]
	]

cstToJSON[CodeParser`ContainerNode[kind_, children_, meta_]] :=
	<|
		"type" -> "ContainerNode",
		"kind" -> ToString[kind],
		"children" -> Map[cstToJSON, children],
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[CodeParser`CallNode[headNodes_List, childGroup_CodeParser`GroupNode, meta_]] :=
	<|
		"type" -> "CallNode",
		"head" -> If[headNodes === {}, <|"type" -> "Unknown", "wl" -> ""|>, cstToJSON[First[headNodes]]],
		"children" -> Map[cstToJSON, childGroup[[2]]],
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[CodeParser`LeafNode[kind_, value_, meta_]] :=
	<|
		"type" -> "LeafNode",
		"kind" -> ToString[kind],
		"value" -> value,
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[CodeParser`InfixNode[op_, children_, meta_]] :=
	<|
		"type" -> "InfixNode",
		"op" -> ToString[op],
		"children" -> Map[cstToJSON, children],
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[CodeParser`BinaryNode[op_, children_, meta_]] :=
	<|
		"type" -> "BinaryNode",
		"op" -> ToString[op],
		"children" -> Map[cstToJSON, children],
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[CodeParser`PrefixNode[op_, children_, meta_]] :=
	<|
		"type" -> "PrefixNode",
		"op" -> ToString[op],
		"children" -> Map[cstToJSON, children],
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[CodeParser`PostfixNode[op_, children_, meta_]] :=
	<|
		"type" -> "PostfixNode",
		"op" -> ToString[op],
		"children" -> Map[cstToJSON, children],
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[CodeParser`CompoundNode[op_, children_, meta_]] :=
	<|
		"type" -> "CompoundNode",
		"op" -> ToString[op],
		"children" -> Map[cstToJSON, children],
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[CodeParser`GroupNode[kind_, children_, meta_]] :=
	<|
		"type" -> "GroupNode",
		"kind" -> ToString[kind],
		"children" -> Map[cstToJSON, children],
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[CodeParser`TernaryNode[op_, children_, meta_]] :=
	<|
		"type" -> "TernaryNode",
		"op" -> ToString[op],
		"children" -> Map[cstToJSON, children],
		"source" -> meta[CodeParser`Source]
	|>

cstToJSON[other_] :=
	DeleteMissing @ <|
		"type" -> "Unknown",
		"source" -> nodeSource[other],
		"wl" -> ToString[other, InputForm]
	|>

getCSTJSON[source_String, tabWidth_:2] :=
	Module[{cst, json},
		cst = Quiet @ Check[CodeParser`CodeConcreteParse[source, "TabWidth" -> tabWidth], $Failed];
		If[cst === $Failed, Return["null"]];
		json = Quiet @ Check[ExportString[cstToJSON[cst], "JSON"], $Failed];
		If[! StringQ[json], Return["null"]];
		json
	]
