var http = require('http');
var config = require('./config').config;

var allowed_ips = ['127.0.0.1'];
var server = http.createServer(function(request, response) {
	if (allowed_ips.indexOf(request.connection.remoteAddress) == -1) {
		// TODO: dynamic IP whitelisting
		response.writeHead(401);
		response.write("Dynamic IP allowing is pending");
		response.end();
	}
	var host = request.headers['host'].split(':');
	var proxy = http.createClient(host[1] || 80, host[0])
    console.log('Requesting ' + request.url);
	var proxy_request = proxy.request(request.method, request.url.substr(request.headers['host'].length + 7), request.headers);
	proxy_request.addListener('response', function(proxy_response) {
        var pos = 0;
        var buffer = new Buffer(0);
        var ended = false;
        var timer = setInterval(function() {
            var size = Math.min(config.buffer_size, buffer.length - pos);
            if (size <= 0) return;
            var subbuffer = new Buffer(size);
            buffer.copy(subbuffer, 0, pos, size+pos);
            //response.write(subbuffer, 'binary');
            response.write(subbuffer, 'binary');
            pos += size;
            if (pos == buffer.length && ended == true) {
                response.end();
                clearInterval(timer);
            }
        }, config.throttling);
		proxy_response.addListener('data', function(chunk) {
            var newBuffer = new Buffer(buffer.length + chunk.length);
            buffer.copy(newBuffer);
            chunk.copy(newBuffer, buffer.length);
            buffer = newBuffer;
		});
		proxy_response.addListener('end', function() {
            ended = true;
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
