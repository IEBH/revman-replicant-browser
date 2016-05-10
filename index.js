var _ = require('lodash');
var async = require('async-chainable');
var fs = require('fs');
var handlebars = require('handlebars');
var revman = require('revman');
var tidy = require('htmltidy2').tidy;

module.exports = function(options, finish) {
	var settings = _.defaults(options, {
		revman: null, //  to the revman file to use
		grammar: null, //  to the grammar file to use
	});

	async()
		// Sanity checks {{{
		.then(function(next) {
			if (!settings.revman) return next('No RevMan file path specified');
			if (!settings.grammar) return next('No Grammar file path specified');
			next();
		})
		// }}}
		// Read in all file contents {{{
		.parallel({
			revman: next => revman.parseFile(settings.revman, next),
			grammar: next => fs.readFile(settings.grammar, 'utf-8', next),
		})
		// }}}
		// }}}
		// Setup handlebars helpers {{{
		.then(function(next) {
			handlebars.registerHelper('ifNone', function(data, node) {
				var comparitor;
				if (!data) {
					comparitor = 0;
				} else if (_.isArray(data)) {
					comparitor = data.length;
				} else {
					comparitor = data;
				}
				return (!comparitor) ? node.fn(this) : '';
			});
			handlebars.registerHelper('ifSingle', function(data, node) {
				var comparitor = _.isArray(data) ? data.length : data;
				return (comparitor == 1) ? node.fn(this) : '';
			});
			handlebars.registerHelper('ifMultiple', function(data, node) {
				var comparitor = _.isArray(data) ? data.length : data;
				return (comparitor > 1) ? node.fn(this) : '';
			});

			handlebars.registerHelper('pick', function(node) {
				return _(node.fn(this))
					.split(/\s*\n\s*/)
					.filter()
					.map(i => _.trim(i))
					.sample();
			});
			next();
		})
		// }}}
		// Compile template {{{
		.then('result', function(next) {
			var template = handlebars.compile(this.grammar);
			next(null, template(this.revman));
		})
		// }}}
		// Tidy HTML {{{
		.then('result', function(next) {
			tidy(this.result, {
				doctype: 'html5',
				indent: true,
			}, next)
		})
		// }}}
		.end(function(err) {
			if (err) return finish(err);
			finish(null, this.result);
		});

};