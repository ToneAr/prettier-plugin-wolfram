(* tests/wl/modules.wl — Module/With/Block scoping constructs *)
(* Simple Module *)
Module[{x, y}, x = 1; y = 2; x + y]                                                                 (* Module with initialized vars *)
Module[{x = 0, y = 0, accumulator = {}},
	x = 10; y = 20; AppendTo[accumulator, x + y]; accumulator
]
(* With — binds constants *)
With[{n = 5, m = 10}, n * m + n]
(* Block — dynamic binding *)
Block[{$RecursionLimit = 100}, someRecursiveFunction[data]]
(* Deeply nested *)
Module[{result}, result = With[{scale = 2}, Block[{x = 3}, scale * x]]; result]
(* Many variables — should trigger break *)
Module[{
	aVeryLongVariableName = 0,
	anotherLongName = 1,
	yetAnotherOne = 2,
	andOneMore = 3
},
	aVeryLongVariableName + anotherLongName + yetAnotherOne + andOneMore
]