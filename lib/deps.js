var path = require('path');
var fs = require('fs');
var glob = require('glob');
var cheerio = require('cheerio');

var re_comment_line = /\/\/[^\n]*(\n|$)/g;
var re_comment_mult = /\/\*.*?\*\//g;


exports.compile_html = function (contents) {

	var $ = cheerio.load(contents, {
    normalizeWhitespace: true
  });

	// A template document always contains a node
	// <meta ng-module="my_module" [requires="ng, ..."]>
	var module_node = $('meta[ng-module]').first();
	var module_name = module_node.attr('ng-module'); // we get this one in the meta.

	// Build the list of dependencies that are specified in the
	// 'require' attribute of the meta node.
	var deps = (module_node.attr('require') || '').split(',')
		.map(function (m) {
			return m.trim();
		}).filter(function (m) { return m !== ''; });

	// add ng to the dependencies by default, since we're going to need
	// at least the $templateCache service.
	if (deps.indexOf('ng') === -1)
		deps.splice(0, 0, 'ng');
	deps = "'" + deps.join('\', \'') + "'";

	var templates = [];
	$('script[type="text/ng-template"]').each(function (i, node) {
		node = $(node);
		templates.push('      $del.put(\n        "{0}",\n        {1}\n      );\n\n'.format(
			node.attr('id'),
			JSON.stringify(node.html())
		));
	});

	var result = '(function (angular) {\n' +
	'  var mod = angular.module("{0}", [{1}]);\n\n'.format(module_name, deps) +
	'  mod.config(["$provide", function ($provide) {\n\n' +
	'    $provide.decorate("$templateCache", ["$delegate", function ($del) {\n\n' +
					templates.join('') +
	'      return $del;\n\n' +
	'    }]);\n\n' +
	'  }]);\n' +
	'})(angular);';

	return result;
};

exports.handleTemplate = function (filename) {

	var base = path.basename(filename);
	var dir = path.dirname(filename);

	var source = fs.readFileSync(filename, 'utf-8');
	var exten = base.split('.');
	var simple_name = exten[0];
	var final_name = path.join(dir, '_ngcompile_' + simple_name + '.js');

	// we have to use a template engine.
	if (exten.length > 2) {
		var template_engine = exten[1];
		source = require(template_engine).compile(source)();
	}

	fs.writeFileSync(final_name, exports.compile_html(source));
};


exports.parseFile = function (filename) {
	// Angular module declaration regexp.

	var source = fs.readFileSync(filename, 'utf-8');


	var fcontents = source
		.replace(re_comment_line, '')
		.replace(re_comment_mult, '').trim();

	var f = {
		name: fs.realpathSync(filename),
		// source: source,
		declares: [],
		requires: []
	};

	var re_module = /angular.module\(('[^']*'|"[^"]*")\s*,(?:\s*\[([^\]]+)\])?/g;
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

					if (!f.requires.some(dep))
						f.requires.push(dep);
				});
			}
		}
	}

	return f;
};

exports.parseDir = function (dir) {

	var result = [];

};
