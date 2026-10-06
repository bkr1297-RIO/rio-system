import { createServer } from 'node:http';
import { MAX_RECORD_BYTES, MAX_RETURN_BYTES } from './bilateral.mjs';

/** Loopback adapter. Node signatures carry attribution; receiving bytes grants
 * no permission. Deploy behind a separately governed tunnel for remote clients.
 */
export function createFieldServer(field) {
  return createServer(
    { requestTimeout: 10000, headersTimeout: 10000 },
    async (req, res) => {
      const reply = (status, value) => {
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(value));
      };
      if (req.headers.origin)
        return reply(403, { error: 'BROWSER_ORIGIN_NOT_ALLOWED' });
      if (req.method !== 'POST') return reply(405, { error: 'POST_REQUIRED' });
      if (
        ![
          '/control',
          '/candidates',
          '/admit',
          '/execute',
          '/invoke',
          '/observe',
          '/hold',
          '/passages',
          '/query',
          '/arrow',
          '/projection',
          '/dispatch',
          '/receive',
          '/returns',
        ].includes(req.url)
      )
        return reply(404, { error: 'UNKNOWN_ROUTE' });
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > (req.url === '/returns' ? MAX_RETURN_BYTES : MAX_RECORD_BYTES)) {
            reply(413, { error: 'RECORD_TOO_LARGE' });
            return;
          }
          chunks.push(chunk);
        }
        const record = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        let value;
        if (req.url === '/control') {
          field.assertControlTransport(record, 'http-json');
          value = field.control(record);
        } else if (req.url === '/query') value = field.query(record);
        else if (req.url === '/arrow') {
          if (record?.body?.type === 'arrow_propose')
            field.assertTransport(record, 'http-json');
          else field.assertControlTransport(record, 'http-json');
          value = field.arrow(record);
        } else if (req.url === '/projection') {
          if (record?.body?.type === 'passage') {
            field.assertTransport(record, 'http-json');
            value = field.operateProjection(record);
          } else {
            field.assertControlTransport(record, 'http-json');
            value = field.projection(record);
          }
        } else {
          field.assertTransport(
            req.url === '/execute' ? record.record : record,
            'http-json',
          );
          if (req.url === '/candidates') value = field.candidate(record);
          if (req.url === '/dispatch') value = await field.dispatch(record);
          if (req.url === '/receive') value = field.receive(record);
          if (req.url === '/returns') value = field.admitReturn(record);
          if (req.url === '/admit') value = field.admit(record);
          if (req.url === '/invoke') value = field.invoke(record);
          if (req.url === '/observe') value = field.observe(record);
          if (req.url === '/hold') value = field.hold(record);
          if (req.url === '/execute')
            value = field.execute(record.passage_id, record.record);
          if (req.url === '/passages') {
            field.admit(record);
            value = field.execute(record.body.passage_id, record);
          }
        }
        reply(200, value);
      } catch (e) {
        reply(409, { error: e.message });
      }
    },
  );
}
