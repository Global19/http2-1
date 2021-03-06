// Flags: --expose-http2
'use strict';

const common = require('../common');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const tls = require('tls');
const h2 = require('http2');

function loadKey(keyname) {
  return fs.readFileSync(
    path.join(common.fixturesDir, 'keys', keyname), 'binary');
}

function onStream(stream, headers) {
  const socket = stream.session.socket;
  assert(headers[':authority'].startsWith(socket.servername));
  stream.respond({
    'content-type': 'text/html',
    ':status': 200
  });
  stream.end(JSON.stringify({
    servername: socket.servername,
    alpnProtocol: socket.alpnProtocol
  }));
}

function verifySecureSession(key, cert, ca, opts) {
  const server = h2.createSecureServer({cert, key});
  server.on('stream', common.mustCall(onStream));
  server.listen(0);
  server.on('listening', common.mustCall(function() {
    const headers = { ':path': '/' };
    if (!opts) {
      opts = {};
    }
    opts.secureContext = tls.createSecureContext({ca});
    const client = h2.connect(`https://localhost:${this.address().port}`, opts, function() {
      const req = client.request(headers);

      req.on('response', common.mustCall(function(headers) {
        assert.strictEqual(headers[':status'], 200, 'status code is set');
        assert.strictEqual(headers['content-type'], 'text/html',
                           'content type is set');
        assert(headers['date'], 'there is a date');
      }));

      let data = '';
      req.setEncoding('utf8');
      req.on('data', (d) => data += d);
      req.on('end', common.mustCall(() => {
        const jsonData = JSON.parse(data);
        assert.strictEqual(jsonData.servername, opts.servername || 'localhost');
        assert.strictEqual(jsonData.alpnProtocol, 'h2');
        server.close();
        client.socket.destroy();
      }));
      req.end();
    });
  }));
}

// The server can be connected as 'localhost'.
verifySecureSession(
    loadKey('agent8-key.pem'),
    loadKey('agent8-cert.pem'),
    loadKey('fake-startcom-root-cert.pem'));

// Custom servername is specified.
verifySecureSession(
    loadKey('agent1-key.pem'),
    loadKey('agent1-cert.pem'),
    loadKey('ca1-cert.pem'),
    {servername: 'agent1'});
