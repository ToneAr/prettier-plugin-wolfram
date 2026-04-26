{
	"targets": [{
		"target_name": "wstp",
		"sources": ["wstp.cc"],
		"include_dirs": [
			"<!@(node -p \"require('node-addon-api').include\")",
			"<!@(node ../scripts/find-wstp.js --include)"
		],
		"libraries": [
			"<!@(node ../scripts/find-wstp.js --lib)"
		],
		"cflags_cc": ["-std=c++17"],
		"cflags_cc!": ["-fno-exceptions"],
		"defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
	}]
}
