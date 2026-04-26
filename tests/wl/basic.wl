(* tests/wl/basic.wl — simple expressions for basic formatting *)
x = 1


y = 2 + 3


z = x * y - 1


longName =
	StringJoin[
		"a very long string that might wrap depending on line width settings ",
		"and how the printer handles string literals"
	]


(* Arithmetic *)
result = a + b + c + d + e + f


product = a * b * c

(* Nested calls *)
f[g[h[x]]]
foo[1, 2, 3, 4, 5]

(* Compound assignment *)
a = b = c = 0