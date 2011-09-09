var http = require('http');
var config = require('./config').config;
var mysql = require('mysql');

var database;
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
    var requestId = 0;
    database.query('INSERT INTO request (request_url, request_method, request_headers, request_body, response_headers, response_body) VALUES (?, ?, ?, ?, "", "")', [
            request.url,
            request.method,
            JSON.stringify(request.headers),
            "",
        ], function(err, info) {
            requestId = (info.insertId);
        }
    );
	proxy_request.addListener('response', function(proxy_response) {
        // TODO: fix race condition with DB insert id
        database.query('UPDATE request SET response_code = ?, response_headers = ? WHERE id = ?', [
            proxy_response.statusCode,
            JSON.stringify(proxy_response.headers),
            requestId,
        ]);
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
            // TODO: fix race condition with DB insert id
            database.query('UPDATE request SET response_body = ? WHERE id = ?', [
                buffer.toString('utf-8'),
                requestId,
            ]);
            ended = true;
		});
		response.writeHead(proxy_response.statusCode, proxy_response.headers);
	});
	request.addListener('data', function(chunk) {
        // TODO: log request body
		proxy_request.write(chunk, 'binary');
	});
	request.addListener('end', function() {
		proxy_request.end();
	});
});

server.listen(config.port);
console.log('Listening at port ' + config.port);
(function() {
    var db_config = config.database;
    delete db_config['type']; //only supporting mysql
    database = mysql.createClient(db_config);
})()
