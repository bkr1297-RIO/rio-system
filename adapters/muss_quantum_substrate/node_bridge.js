const { generateReceipt } = require('../../rio-receipt-protocol/src/receipt.js'); // adjust path as needed

/**
 * Node.js bridge for MUSS Quantum Substrate Adapter → rio-receipt-protocol
 * Generates cryptographically signed MUS receipts for quantum workloads.
 */

async function generateMUSReceipt(payload) {
  try {
    // Use the official rio-receipt-protocol
    const receipt = await generateReceipt({
      ...payload,
      mus_unit_id: 'muss_quantum_substrate_adapter_v0.1',
      timestamp: new Date().toISOString(),
    });

    console.log('✅ MUS Receipt generated:', JSON.stringify(receipt, null, 2));
    return receipt;
  } catch (error) {
    console.error('❌ Receipt generation failed:', error);
    throw error;
  }
}

// Export for use from Python subprocess or direct require
module.exports = { generateMUSReceipt };

// CLI support
if (require.main === module) {
  const input = process.argv[2];
  if (input) {
    generateMUSReceipt(JSON.parse(input));
  }
}
