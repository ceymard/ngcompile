var fs = require('fs');
var glob = require('glob');

var re_comment_line = /\/\/[^\n]*(\n|$)/g;
var re_comment_mult = /\/\*.*?\*\//g;

exports.parseFile = function (filename) {
	// Angular module declaration regexp.
	var re_module = /angular.module\(('[^']*'|"[^"]*")(?:,\s*\[([^\]]+)\])?/g;

	var source = fs.readFileSync(filename, 'utf-8');

	var fcontents = source
		.replace(re_comment_line, '')
		.replace(re_comment_mult, '').trim();

	var f = {
		name: fs.realpathSync(filename),
		// source: source,
		declares: [],
		requires: []
	}

	var match = null;

	while (match = re_module.exec(fcontents)) {
		var modname = match[1].slice(1, -1);
		var deps = match[2];

		// An angular declaration is when we open an
		// array.
		if (!f.declares.some(modname))
			f.declares.push(modname);

		if (deps) {
			// Handle dependencies
			deps = deps.trim();
			if (deps) {
				deps.split(/\s*,\s*/).each(function (dep) {
					dep = dep.slice(1, -1); // remove the quotes
					f.requires.push(dep);
				});
			}
		}
	}

	return f;
}

exports.parseDir = function (dir) {

	var result = [];

};
