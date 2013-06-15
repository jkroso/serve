
var JS = require('sourcegraph/src/plugins/javascript').types[0]
	, Graph = require('sourcegraph')
	, Compiler = require('bigfile')
	, cheerio = require('cheerio')
  , path = require('path')
	, dirname = path.dirname
	, join = path.join
	, fs = require('fs')

module.exports = function(base, opts){
	var graph = new Graph()
		.use('nodeish')
		.use('mocha')
		.use('css')
		.use('stylus')
		.use('jade')

	var build = new Compiler(path.basename(base))
		.plugin('nodeish')
		.plugin('css')
		.plugin('stylus')
		.plugin('jade')
		.use('transform')
		.use('quick-path-shorten')
		.use('development')
		.use('umd')
		.use(function(code){
			this.end(code)
		})

	return function(req, res, next){
		var path = join(base, req.url)
		var stat
		try {
			stat = fs.statSync(path)
		} catch (e) {
			return next(e)
		}

		// javascript file
		if (/\.js$/.test(path) && stat.isFile()) {
			return graph.clear()
				.add(path)
				.then(values)
				.read(function(files){
					build.end = function(code){
						res.setHeader('Content-Type', 'application/javascript')
						res.end(code)
					}
					build.entry = path
					build.send(files)
				})
		}

		var index = join(path, 'index.html')
		if (stat.isDirectory() && fs.existsSync(index)) {
			path = index
			stat = fs.statSync(path)
		}

		// handle embeded js
		if (/\.html$/.test(path) && stat.isFile()) {
			var html = fs.readFileSync(path)
			var $ = cheerio.load(html)
			var scripts = $('script')
			var script = scripts[0]
			if (scripts.length == 1 && typeof script.attribs.src != 'string') {
				graph.clear()
				script = script.children[0].data
				// remove indentation
				if ((/\n([ \t]+)[^\s]/).test(script)) {
					script = script.replace(new RegExp('^' + RegExp.$1, 'mg'), '')
				}
				var file = graph.graph[path] = {
					path: path,
					'last-modified': stat.mtime,
					text: script,
					parents: [],
					children: [],
					aliases: [],
					base: dirname(path)
				}
				file.requires = JS.prototype.requires.call(file)
				return graph.trace(file).then(function(){
					build.entry = path
					build.end = function send(code){
						scripts[0].children[0].data = code
						res.setHeader('Content-Type', 'text/html; charset=utf-8')
						res.end($.html())
					}
					build.send(values(graph.graph))
				})
			}
		}
		
		next()
	}
}

function values(obj){
	var vals = []
	for (var k in obj) vals.push(obj[k])
	return vals
}