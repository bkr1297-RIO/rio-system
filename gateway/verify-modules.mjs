import('./routes/index.mjs')
  .then(() => console.log('routes/index.mjs: LOADS OK'))
  .catch(e => console.log('routes/index.mjs: FAIL', e.message));

import('./routes/api-v1.mjs')
  .then(() => console.log('routes/api-v1.mjs: LOADS OK'))
  .catch(e => console.log('routes/api-v1.mjs: FAIL', e.message));

import('./receipts/receipts.mjs')
  .then(m => {
    const r = m.generateReceipt({
      receipt_type: 'governed_action',
      intent_id: 'test-1',
      action: 'send_email',
      agent_id: 'I-1',
      authorized_by: 'I-2',
      timestamp: new Date().toISOString(),
      intent_hash: 'a',
      governance_hash: 'b',
      authorization_hash: 'c',
      execution_hash: 'd',
    });
    console.log('receipts.mjs: LOADS OK');
    console.log('Receipt has policy block:', !!r.policy);
    console.log('Policy block:', JSON.stringify(r.policy));
    console.log('Receipt hash present:', !!r.hash_chain?.receipt_hash);
  })
  .catch(e => console.log('receipts.mjs: FAIL', e.message));
