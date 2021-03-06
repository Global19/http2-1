// Flags: --expose-http2
'use strict';

const common = require('../common');
const assert = require('assert');
const h2 = require('http2');

const server = h2.createServer();

// we use the lower-level API here
server.on('stream', common.mustCall(onStream));

function onStream(stream, headers, flags) {

  [
    ':path',
    ':authority',
    ':method',
    ':scheme'
  ].forEach((i) => {
    assert.throws(() => stream.respond({[i]: '/'}),
                  common.expectsError({
                    code: 'ERR_HTTP2_INVALID_PSEUDOHEADER'
                  }));
  });

  stream.respond({
    'content-type': 'text/html',
    ':status': 200
  });

  // This will cause an error to be emitted on the stream because
  // using a pseudo-header in a trailer is forbidden.
  stream.on('fetchTrailers', (trailers) => {
    trailers[':status'] = 'bar';
  });

  stream.on('error', common.expectsError({
    code: 'ERR_HTTP2_INVALID_PSEUDOHEADER'
  }));

  stream.end('hello world');
}

server.listen(0);

server.on('listening', common.mustCall(() => {

  const client = h2.connect(`http://localhost:${server.address().port}`);

  const req = client.request({ ':path': '/' });

  req.on('response', common.mustCall());
  req.resume();
  req.on('end', common.mustCall(() => {
    server.close();
    client.destroy();
  }));
  req.end();

}));
