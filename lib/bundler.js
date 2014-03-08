var fs = require('fs');
var glob = require('glob');
var path = require('path');
var uglifyjs = require('uglify-js');

var deps = require('./deps');

MAX_REFRESH_RATE = 50; // in ms.


function Bundler(opts) {

	// The files, with their sources and all.
	this.files = Object.extended();
	this.watches = Object.extended();
	this.watch = opts.watch;

	this.bundles = [];
	this.ignored = [];
}


Bundler.prototype = {
	addFile: function (file, event) {
		// Ignore output files.
		if (this.bundles.some(function (b) {
			if (file === b.outfile || file === b.simplified)
				return true;
			return false;
		})) {
			return;
		}

		if (fs.existsSync(file)) {
			if (file.endsWith('.tpl')) {
				// this will most likely create a .js file in the end,
				// which should be picked up by the watcher.
				deps.handleTemplate(file);
			}

			if (file.endsWith('.js')) {
				// Javascript file, parse it !
				var f = deps.parseFile(file)
				this.files[file] = f;

				// Do not watch files with no dependency !
				if (f.declares.length === 0 && f.requires.length === 0) {
					return;
				}
			}

			if (!this.watches[file] && this.watch)
				this.watches[file] = fs.watch(file, this._fileHook.bind(this, file));

			this.bundleAll(file);
		} else {
			delete this.watches[file];
			fs.unwatch(file);
		}

	},

	_fileHook: function (filename, evt, evt_filename) {

		// simple file change, should trigger a rebuild of
		// all the bundles associated to that file.
		// if (!fs.existsSync(filename))
		// 	this.removeFile(filename);
		// else
		// 	this.addFile(filename);

		try {
			var is_dir = fs.statSync(filename).isDirectory();
			if (!evt_filename)
				return;
		} catch (e) {
			return;
		}
		var that = this;

		// Sometimes, the filename was a directory, so we need to
		// add it to the mix.
		filename = is_dir ? path.join(filename, evt_filename) : filename;

		try {
			if (fs.statSync(filename).isDirectory())
				this.addDir(filename);
			else
				this.addFile(filename);
		} catch (e) { }
	},

	addDir: function (dir) {
		var that = this;

		glob(dir + '/**', function (err, files) {

			files.each(function (file) {
				that.addFile(fs.realpathSync(file));
			});

		});

		return this;
	},

	// Return a list of files in the order of their dependencies
	buildDeps: function (appname) {
		var files = [];
		var that = this;

		// The modules that we already have resolved.
		var resolved = [];

		// The needed modules
		var needed = appname.split(',');

		// The files that are to be included, in order.
		var bundle_files = [];

		while (needed.length > 0) {
			var newneeded = [];
			var need = needed[0];
			var found_declaring_file = false;

			needed = needed.slice(1);

			if (resolved.indexOf(need) >= 0)
				continue;

			// Whatever happens, we handled that dependency.
			resolved.push(need);

			// console.dir(that.files);
			that.files.each(function (key, file) {
				if (file.declares.indexOf(need) >= 0) {
					found_declaring_file = true;
					if (files.indexOf(file.name) < 0) {
						files.push(file.name);
						// console.log(need + ' -> ' + path.basename(file.name));
					}

					file.requires.each(function (dep) {
						needed.push(dep);
					});
				}
			});

			if (!found_declaring_file && need !== 'ng')
				console.error('No file found for module <' + need + '>');
		}

		return files;
	},

	addIgnore: function (pattern) {
		this.ignored.push(pattern);
	},

	addBundle: function (bundle) {
		this.bundles.push(bundle);
	},

	bundleAll: (function (file) {
		this.bundles.each(function (bundle) {
			if (!bundle.files || bundle.files.indexOf(file) >= 0) {
				this.bundle(bundle);
			}
		}.bind(this));
	}).debounce(MAX_REFRESH_RATE),


	/**
	*/
	bundle: (function (bundle) {
		var files = this.buildDeps(bundle.appname);
		bundle.files = files;

		// var full = [];

		// files.each(function (f) {
		// 	full.push('/* ' + f + ' */\n' + fs.readFileSync(f, 'utf-8'));
		// });

		// full = full.join('\n');

		if (bundle.outfile) {

			var destcwd = path.dirname(bundle.outfile);
			var basename = path.basename(bundle.outfile);
			var mapname = basename + '.map';

			try {
				var result = uglifyjs.minify(files, {
					outSourceMap: mapname
				});
			} catch (e) {
				// console.dir(e);
				console.log('Parse error: ' + e.message + ' - l:' + e.line + ', c:' + e.col);
				console.log('!! Not bundling `' + bundle.appname + '`');
				return;
			}

			var map = JSON.parse(result.map);
			var cwd = process.cwd();

			map.file = map.file.replace(cwd + '/', '');
			map.sources.forEach(function (source, idx) {
				map.sources[idx] = source.replace(cwd + '/', '');
			});

			if (bundle.uglify) {
				result.code += '\n//# sourceMappingURL=./' + mapname;
				fs.writeFileSync(bundle.outfile + '.map', JSON.stringify(map));
			}

			fs.writeFileSync(bundle.outfile, result.code);
		}

		console.log('>> Done bundling `' + bundle.appname + '`');
	}).debounce(MAX_REFRESH_RATE)
};

exports.Bundler = Bundler;
