
var sugar = require('sugar');

String.prototype.format = function () {
	var replacements = Array.prototype.slice.call(arguments, 0);

	if (replacements.length === 1 && Object.isObject(replacements[0])) {
		Object.merge(replacements, replacements[0]);
	}

	return this.replace(/\{[^\}]+\}/g, function (m) {
		m = m.slice(1, -1);
		if (replacements[m] === null)
			return '<null>';
		if (replacements[m] === undefined)
			return '<undefined>';
		return replacements[m].toString();
	});
}

exports.Bundler = require('./bundler').Bundler;
