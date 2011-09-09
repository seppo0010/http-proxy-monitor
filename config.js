exports.config = {
	port: 8080,
	interactive: true,
    buffer_size: 1024,
    throttling: 1,
    database: {
        type: 'mysql', //only supported type
        database: 'proxy',
        user: 'root',
        password: 'root',
        port: 8889,
        host: '127.0.0.1',
    }
}
