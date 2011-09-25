var mysql = require('mysql');

exports.log = {
	requestId: 0,
	error: null,
	database: null,
	init: function(config, hooks_handler) {
		var db_config = config.database;
		delete db_config['type']; //only supporting mysql
		this.database = mysql.createClient(db_config);

		hooks_handler.addEventListener('request', this.onRequest.bind(this));
		hooks_handler.addEventListener('status', this.onStatus.bind(this));
		hooks_handler.addEventListener('data', this.onData.bind(this));
		hooks_handler.addEventListener('close', this.onClose.bind(this));
	},
	onRequest:function(request) {
		this.database.query('INSERT INTO request (request_url, request_method, request_headers, request_body, response_headers, response_body) VALUES (?, ?, ?, "", "", "")', [
			request.url,
			request.method,
			JSON.stringify(request.headers)
		], (function(err, info) {
			if (err) {
				console.log(err.message);
				this.error = err;
			} else {
				this.requestId = (info.insertId);
			}
		}).bind(this));
	},
	onStatus:function(response, proxy_response, attempts) {
		if (this.error) return;
		if (this.requestId == 0) {
			if (attempts >= 10) {
				console.log("Unable to get response after " + attempts + " (no id received from DB)");
			}
			setTimeout((function() {
				this.onResponse(response, proxy_response, (attempts || 0) + 1);
			}),bind(this), 1000);
			return;
		}
		this.database.query('UPDATE request SET response_code = ?, response_headers = ?, connection_status = GREATEST(connection_status, 2) WHERE id = ?', [
			proxy_response.statusCode,
			JSON.stringify(proxy_response.headers),
			this.requestId,
		]);
	},
	onData:function(response, chunk) {
		if (this.requestId == 0) {
			throw new Exception("FATAL: data received without request id from database");
		}
		this.database.query('UPDATE request SET response_body = CONCAT(response_body, ?), connection_status = GREATEST(connection_status, 3) WHERE id = ?', [
			chunk.toString('utf-8'),
			this.requestId,
		]);

	},
	onClose:function() {
		if (this.requestId == 0) {
			throw new Exception("FATAL: closing connection without request id from database");
		}
		this.database.query('UPDATE request SET connection_status = GREATEST(connection_status, 4) WHERE id = ?', [
			this.requestId,
		]);
	}
}
