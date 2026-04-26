(* tests/wl/production-readiness.wl — broad formatter coverage for production readiness *)
(* Basic spacing and arithmetic *)
alpha = 1                                                                                           (* documented alpha *)


beta = 2 + 3                                                                                        (* documented beta *)


gamma = alpha * beta - 1


(* Long line should wrap when printWidth is small *)
veryLongComputation =
	someVeryLongFunctionName[
		firstArgument,
		secondArgument,
		thirdArgument,
		fourthArgument,
		fifthArgument,
		sixthArgument
	]
(* Nested calls and comma spacing *)
foo[1, 2, 3, 4, 5]
bar[baz[1, 2], qux[3, 4], zap[5, 6]]
(* Rules and patterns *)
f[x_] := x ^ 2


g[x_Integer /; x > 0] := x - 1


h[x_Real] = x / 2.0
(* Replacement rules *)
expr /. {f[x_] :> g[x ^ 2], h[y_] :> k[y + 1]}
(* Condition and operator spacing *)
safeDiv[x_, y_] /; y != 0 := x / y


(* Block-structure forms that should stay flat if they fit *)
process[data_, OptionsPattern[]] :=
	Module[{v = OptionValue[Verbose]}, If[v, Print["processing"]]; data]
With[{scale = 2}, scale * x + 1]
Block[{$RecursionLimit = 100}, someRecursiveFunction[data]]
(* Which / If / Switch *)
If[x > 0, positive, negative]
Which[ x < 0, "neg", x == 0, "zero", True, "pos"]
Switch[x, 1, "one", 2, "two", _, "other"]
(* Associations *)
<|a -> 1, b :> x + 1|>
foo[<|a -> 1, b -> 2|>]
<||>
<|"nested" -> <|left -> 1, right -> 2|>, "list" -> {1, 2, 3}|>
(* Prefix / postfix operators *)
!flag
++counter
--counter
counter++
counter--
n!
n!!
(* Pure functions and slots *)
f&
#&
Map[# ^ 2&, {1, 2, 3}]
({#1, #2}&)[a, b]
Apply[List, ##2]&
(* Binary shorthand operators *)
f /@ xs
g @@ expr
h @@@ listOfArgs
k //@ expr
x // f
x // g // h
(* General infix ~f~ should normalize to call syntax *)
f[x, y]
(* Preserved infix operator form *)
x ~ Join ~ y
(* Mixed nested shorthand / structural stress test *)
finalResult =
	Module[{pairs = <|a -> 1, b -> 2|>},
		({#1, #2}& @@@ Normal[pairs]) // Reverse
	]


Options[process] = {Verbose -> False}