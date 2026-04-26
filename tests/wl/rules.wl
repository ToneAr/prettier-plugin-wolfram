(* tests/wl/rules.wl — pattern matching and rule definitions *)
(* Simple function rule *)
f[x_] := x ^ 2


(* Multi-clause *)
factorial[0] = 1


factorial[n_Integer /; n > 0] := n * factorial[n - 1]


(* Pattern with head *)
double[x_Integer] := 2 * x


double[x_Real] = 2.0 * x


(* Delayed rule vs immediate *)
cached = Expand[(a + b) ^ 4]


lazyValue := Expand[(a + b) ^ 4]


(* Rule with condition *)
safeDiv[x_, y_] /; y != 0 := x / y
(* RuleDelayed in replacement *)
expr /. {f[x_] :> g[x ^ 2], h[y_] :> k[y + 1]}
(* Association / options pattern *)
process[data_, OptionsPattern[]] :=
	Module[{v = OptionValue[Verbose]}, If[v, Print["processing"]]; data]

<|
	"a" -> 1,
	"b" -> 2,
	"c" -> 3,
	"d" -> 1,
	"e" -> 2,
	"f" -> 3,
	"g" -> 1,
	"h" -> 2,
	"i" -> 3
|>

Map[f, {1, 2, 3}]

Options[process] = {Verbose -> False}