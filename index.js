var http = require('http');
var config = require('./config').config;
var log = require('./plugins/log').log;

var server = http.createServer(function(request, response) {
	var hooks_handler = {
		paused: false,
		pause: function() { this.paused = true; },
		resume: function() {
			while (this.pendingHooks.length > 0) {
				this.pendingHooks.shift().apply();
				console.log(this.pendingHooks);
			}
			this.paused = false;
		},
		preventedRequestDefault: false,
		preventRequestDefault: function() {},
		requestDefault: function(response, proxy_response) { 
			if (this.preventedRequestDefault) return;
			console.log('new request');
		},
		preventedStatusDefault: false,
		preventStatusDefault: function() {},
		statusDefault: function(response, proxy_response) { 
			if (this.preventedStatusDefault) return;
			console.log('writting status');
			response.writeHead(proxy_response.statusCode, proxy_response.headers);
		},
		preventedDataDefault: false,
		preventDataDefault: function() {},
		dataDefault: function(response, chunk) {
			if (this.preventedDataDefault) return;
			console.log('writting chunk');
			response.write(chunk, 'binary');
		},
		preventedEndDefault: false,
		preventEndDefault: function() {},
		endDefault: function() {
			if (this.preventedEndDefault) return;
			console.log('closing');
			response.end();
		},
		hooksRequest: [],
		hooksStatus: [],
		hooksData: [],
		hooksEnd: [],
		pendingHooks: [],
		hooksToAdd: {},
		addEventListener: function(eventName, callback, _priority) {
			var priority = _priority || 0;
			this.hooksToAdd[eventName] = this.hooksToAdd[eventName] || [];
			this.hooksToAdd[eventName].push({callback:callback,priority:priority});
		},
		prioritizeListeners: function (eventName) {
			if (this.hooksToAdd[eventName] && this.hooksToAdd[eventName].length > 0) {
				this.hooksToAdd[eventName].sort(function(a,b) {
					return a.priority - b.priority;
				});
				var camelizedEventName = eventName.substr(0,1).toUpperCase() + eventName.substr(1);
				for (var pos in this.hooksToAdd[eventName]) {
					this['hooks' + camelizedEventName].push(this.hooksToAdd[eventName][pos].callback);
				}
				delete this.hooksToAdd[eventName];
			}
		},
		callHooks: function (eventName, params) {
			var camelizedEventName = eventName.substr(0,1).toUpperCase() + eventName.substr(1);
			this.prioritizeListeners(eventName);
			if (this['hooks' + camelizedEventName].indexOf(this[eventName + 'Default']) == -1) this['hooks' + camelizedEventName].push(this[eventName + 'Default']);

			if (this.paused || this.pendingHooks.length > 0) { //FIXME: duplicated code
				var pending = this['hooks' + camelizedEventName];
				for (var index in pending) {
					this.pendingHooks.push(function(pendingHook) { return function() { pendingHook.apply(this, params) } }(pending[index]));
				}
				return;
			}
			for (var hook in this['hooks' + camelizedEventName]) {
				this['hooks' + camelizedEventName][hook].apply(this, params);
				if (this.paused) {
					var pending = this['hooks' + camelizedEventName].slice(this['hooks' + camelizedEventName].indexOf(hook) + 1);
					for (var index in pending) {
						this.pendingHooks.push(function(pendingHook) { return function() { pendingHook.apply(this, params) } }(pending[index]));
					}
					break;
				}
			}
		}
	};

	log.init(config, hooks_handler);

	var host = request.headers['host'].split(':');
	var proxy = http.createClient(host[1] || 80, host[0])
	console.log('Requesting ' + request.url);

	hooks_handler.callHooks('request', [request]);

	var proxy_request = proxy.request(request.method, request.url.substr(request.headers['host'].length + 7), request.headers);
	proxy_request.addListener('response', function(proxy_response) {
		//hooks_handler.pause();
		proxy_response.addListener('data', function(chunk) {
			hooks_handler.callHooks('data', [response, chunk]);
		});
		proxy_response.addListener('end', function() {
			hooks_handler.callHooks('end', [response]);
		});
		hooks_handler.callHooks('status', [response, proxy_response]);
	});
	request.addListener('data', function(chunk) {
		proxy_request.write(chunk, 'binary');
	});
	request.addListener('end', function() {
		proxy_request.end();
	});
});

server.listen(config.port);
console.log('Listening at port ' + config.port);
