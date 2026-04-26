(* tests/wl/conditions.wl — If/Switch/Which patterns *)
(* Simple If *)
If[x > 0, positive, negative]
(* Nested If *)
If[x > 0, If[x > 10, big, small], If[x < -10, verynegative, negative]]
(* If with Null else *)
If[flag, doSomething[]]
(* Switch *)
Switch[x, 1, "one", 2, "two", 3, "three", _, "other"]
(* Which *)
Which[ x < 0, "negative", x == 0, "zero", x > 0, "positive"]
(* Which with many clauses *)
Which[
	x < -100,
		"very negative",
	x < 0,
		"negative",
	x == 0,
		"zero",
	x < 100,
		"positive",
	True,
		"very positive"
]