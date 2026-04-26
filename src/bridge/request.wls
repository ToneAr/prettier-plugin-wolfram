payloadPath = $ScriptCommandLine[[2]];
initPath = $ScriptCommandLine[[3]];

Get[initPath];

payload = Quiet @ Check[Import[payloadPath, "RawJSON"], <||>];
result = Quiet @ Check[
	getCSTJSON[Lookup[payload, "source", ""], Lookup[payload, "tabWidth", 2]],
	"null"
];

WriteString[
	$Output,
	"__PRETTIER_WL_JSON_START__",
	Replace[result, Except[_String] -> "null"],
	"__PRETTIER_WL_JSON_END__"
];
Flush[$Output];
