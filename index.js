var _ = require('lodash');
var async = require('async-chainable');
var handlebars = require('handlebars');
var mersenneTwister = require('mersenne-twister');
// Removed revman, tidy, fs

module.exports = function(options, finish) {
	var settings = _.defaults(options, {
		revman: null, //  to the revman file to use
		grammar: null, //  to the grammar file to use
		seed: undefined, // Random seed value to use (to get predictable output)
	});

	var randomGenerator = new mersenneTwister(settings.seed);

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
			grammar: next => next(null, settings.grammar),
			revman: function(next) {
				if (_.isObject(settings.revman)) return next(null, settings.revman); // Already an object
				next('Revman input is not an object')
			},
		})
		// }}}
		// Rewrite some of the grammer so its more logical {{{
		.then('grammar', function(next) {
			// Grammars shouldn't have to insist that `{{input}}` elements are tripple escaped everywhere
			next(null, this.grammar.replace(/{{input(.*?)}}/g, '{{{input$1}}}'));
		})
		// }}}
		// Setup handlebars helpers {{{
		.then(function(next) {
			// Array Utilities {{{
			handlebars.registerHelper('pick', function(node) {
				var content = node.fn(this);
				var options;

				if (!/\r?\n/.test(content)) { // Single line - use `a / b / c` selection
					options = content.split(/\s*\/\s*/);
				} else { // Multi-line - use `a\nb\nc` selection
					options = _(content)
						.split(/\s*\r?\n\s*/)
						.filter()
						.map(i => _.trim(i))
						.value();
				}

				return options[Math.floor(randomGenerator.random() * options.length)];
			});
			// }}}

			// Conditionals {{{
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
			handlebars.registerHelper('ifValue', function(left, conditional, right, node) {
				switch (conditional) {
					case '=':
					case '==':
					case 'eq':
						return left == right ? node.fn(this) : '';
					case '===':
						return left === right ? node.fn(this) : '';
					case 'undefOr': // left is undefined OR right
						return (left === undefined || left == right) ? node.fn(this) : '';
					case '<':
					case 'lt':
						return left < right ? node.fn(this) : '';
					case '<=':
					case 'lte':
						return left <= right ? node.fn(this) : '';
					case '>':
					case 'gt':
						return left > right ? node.fn(this) : '';
					case '>=':
					case 'gte':
						return left >= right ? node.fn(this) : '';
					case 'between': // Form: `{{ifValue FIELD 'between' '10 and 20'}}{{#/ifValue}}`
						var bits = right.split(/\s+AND\s+/i);
						return (left > bits[0] && left < bits[1]) ? node.fn(this) : '';
					default:
						throw new Error('Unknown ifValue conditional');
				}
			});
			// }}}

			// Formatters {{{
			handlebars.registerHelper('formatLowerCase', function(data) {
				if (_.isUndefined(data)) return 'FIXME:UNDEFINED!';
				return data.toLowerCase();
			});
			handlebars.registerHelper('formatNumber', function(data, dp) {
				if (_.isUndefined(data)) return 'FIXME:UNDEFINED!';
				return _.round(data, dp).toLocaleString();
			});
			handlebars.registerHelper('formatP', function(data) {
				if (_.isUndefined(data)) return 'FIXME:UNDEFINED!';
				return (
					data <= 0.00001 ? 'P < 0.00001' :
					data <= 0.0001 ? 'P < 0.0001' :
					data <= 0.001 ? 'P < 0.001' :
					data <= 0.01 ? 'P < 0.01' :
					data <= 0.05 ? 'P < 0.05' :
					'P = ' + _.round(data, 2) // Round to 2 dp (0.248869 => 0.25)
				);
			});
			// }}}

			// User prompting {{{
			handlebars.registerHelper('input', function(type, display, description) {
				switch (type) {
					case 'choice': return '<dfn title="' + description + '">' + display.split(/\s*[,\/]\s*/).join(' / ') + '</dfn>';
					case 'figure': return '<dfn title="' + description + '">' + display + '</dfn>';
					case 'number': return '<dfn title="' + description + '">' + display + '</dfn>';
					case 'text': return '<dfn title="' + description + '">' + display + '</dfn>';
					default: throw new Error('Unknown input type "' + type + '"');
				}
				return '(' + description + ')';
			});
			// }}}

			// Debugging utlities {{{
			/**
			* Output the raw data object as a <pre/> enclosed JSON object
			* @example
			* // Dump the current Handlebars object
			* {{dump this}}
			*/
			handlebars.registerHelper('dump', function(data) {
				return '<pre>' + JSON.stringify(data, null, '\t') + '</pre>';
			});

			/**
			* Similar to `dump` but only return the keys within the object as an array
			* @example
			* // Dump the current Handlebars object keys
			* {{dump this}}
			*/
			handlebars.registerHelper('dumpKeys', function(data) {
				return '<pre>' + JSON.stringify(_.keys(data)) + '</pre>';
			});
			// }}}

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
		// .then('result', function(next) {
		// 	tidy(this.result, {
		// 		doctype: 'html5',
		// 		indent: true,
		// 		wrap: 0,
		// 	}, next)
		// })
		.then('result', function(next) {
			// Misc text tidyups
			next(null, this.result
				// Remove spaces before commas
				.replace(/\s+,\s/g, ', ')

				// Add spaces after full-stops
				.replace(/\.(?<!\s)/g, '. ')
			);
		})
		// }}}
		.end(function(err) {
			if (err) return finish(err);
			finish(null, this.result);
		});

};
