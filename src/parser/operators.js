export const INFIX_OPS = {
	",": "Comma", ";": "CompoundExpression",
	"+": "Plus", "-": "Plus", "*": "Times", "/": "Divide",
	".": "Dot", "**": "NonCommutativeMultiply",
	"~~": "StringExpression", "<>": "StringJoin",
	"|": "Alternatives", "||": "Or", "&&": "And",
	"\\[Equivalent]": "Equivalent", "\\[Or]": "Or", "\\[Nor]": "Nor",
	"\\[Xor]": "Xor", "\\[Xnor]": "Xnor", "\\[And]": "And", "\\[Nand]": "Nand",
	"===": "SameQ", "=!=": "UnsameQ",
	"==": "Equal", "!=": "Unequal", "<": "Less", "<=": "LessEqual",
	">": "Greater", ">=": "GreaterEqual",
	"@*": "Composition", "/*": "RightComposition",
	// U+2062: WL InvisibleTimes (space-multiplication), inserted by preprocessor
	"⁢": "InvisibleTimes",
};
export const BINARY_OPS = {
	"=": "Set", ":=": "SetDelayed", "^=": "UpSet", "^:=": "UpSetDelayed",
	"->": "Rule", ":>": "RuleDelayed", "<->": "TwoWayRule", "|->": "Function",
	"/;": "Condition", "/.": "ReplaceAll", "//.": "ReplaceRepeated",
	"/:": "TagSet", "//": "BinarySlashSlash", "//=": "ApplyTo",
	"+=": "AddTo", "-=": "SubtractFrom", "*=": "TimesBy", "/=": "DivideBy",
	"/": "Divide",
	"^": "Power", "@": "BinaryAt", "@@": "Apply", "@@@": "Apply",
	"/@": "Map", "//@": "MapAll", "?": "PatternTest", ":": "Pattern",
};
export const PREFIX_OPS = {
	"-": "Minus", "+": "Plus", "!": "Not", "!!": "Not",
	"++": "PreIncrement", "--": "PreDecrement",
};
export const POSTFIX_OPS = {
	"&": "Function", "..": "Repeated", "...": "RepeatedNull",
	"'": "Derivative", "!": "Factorial", "!!": "Factorial2",
	"++": "Increment", "--": "Decrement", "=.": "Unset",
};
export function opName(table, literal) {
	const op = table[literal];
	if (op === undefined) throw new Error(`unmapped operator: ${JSON.stringify(literal)}`);
	return op;
}
