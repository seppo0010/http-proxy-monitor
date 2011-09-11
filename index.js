var http = require('http');
var config = require('./config').config;

var server = http.createServer(function(request, response) {
	var host = request.headers['host'].split(':');
	var proxy = http.createClient(host[1] || 80, host[0])
    console.log('Requesting ' + request.url);
	var proxy_request = proxy.request(request.method, request.url.substr(request.headers['host'].length + 7), request.headers);
	proxy_request.addListener('response', function(proxy_response) {
		proxy_response.addListener('data', function(chunk) {
            response.write(chunk, 'binary');
		});
		proxy_response.addListener('end', function() {
            response.end();
		});
		response.writeHead(proxy_response.statusCode, proxy_response.headers);
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
