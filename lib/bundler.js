var fs = require('fs');
var glob = require('glob');
var path = require('path');

var deps = require('./deps');

MAX_REFRESH_RATE = 50; // in ms.


function Bundler() {

	// The files, with their sources and all.
	this.files = Object.extended();
	this.watches = Object.extended();

	this.bundles = [];
	this.ignored = [];
}


Bundler.prototype = {
	addFile: function (file) {
		// we still watch everything.
		if (fs.existsSync(file)) {
			if (file.endsWith('.js')) {
				// Javascript file, parse it !
				this.files[file] = deps.parseFile(file);
			}

			if (!this.watches[file])
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
		} catch (e) {
			return;
		}
		var that = this;

		// Sometimes, the filename was a directory, so we need to
		// add it to the mix.
		filename = is_dir ? filename + '/' + evt_filename : filename;

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
		var needed = [appname];

		// The files that are to be included, in order.
		var bundle_files = [];

		while (needed.length > 0) {
			var newneeded = [];
			var need = needed[0];
			needed = needed.slice(1);

			if (resolved.indexOf(need) >= 0)
				continue;

			// Whatever happens, we handled that dependency.
			resolved.push(need);

			// console.dir(that.files);
			that.files.each(function (key, file) {
				if (file.declares.indexOf(need) >= 0) {
					if (files.indexOf(file.name) < 0) {
						files.push(file.name);
						// console.log(need + ' -> ' + path.basename(file.name));
					}

					file.requires.each(function (dep) {
						needed.push(dep);
					});
				}
			});
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

		var simplified = '//!@@ngcp\n' +
			'(function() {\n' +
				'var head = document.getElementsByTagName("head")[0];\n' +
				'function mkscript(src) {\n' +
				'	var s = document.createElement("script");\n' +
				'	s.type = "text/javascript";\n' +
				'	s.src = src;\n' +
				'	head.appendChild(script);\n' +
			'}\n';

		var full = '//!@@ngcp\n';

		files.each(function (f) {
			simplified += 'mkscript("' + bundle.base + f.replace(bundle.cwd, '') + '");\n';
			full += '/* ' + f + ' */\n' + fs.readFileSync(f, 'utf-8') + '\n';
		});

		simplified += '})();\n';

		if (bundle.simplified)
			fs.writeFileSync(bundle.simplified, simplified);

		if (bundle.outfile)
			fs.writeFileSync(bundle.outfile, full);

		console.log('>> Done bundling `' + bundle.appname + '`');
	}).debounce(MAX_REFRESH_RATE)
};

exports.Bundler = Bundler;
