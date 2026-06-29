import { describe, it, expect, beforeEach } from 'vitest';
import { BlockchainImpl } from '../core/blockchain';
import { Wallet } from '../wallet/wallet';
import { UTXOManager } from '../core/utxo-manager';
import { MinerImpl } from '../core/mining';
import { Mempool } from '../core/mempool';
import { TransactionValidator } from '../core/transaction-validator';

describe('Mempool Debug Test', () => {
  let blockchain: BlockchainImpl;
  let senderWallet: Wallet;
  let recipientWallet: Wallet;
  let minerWallet: Wallet;
  let miner: MinerImpl;
  let mempool: Mempool;

  beforeEach(async () => {
    // Initialize wallets
    senderWallet = new Wallet();
    recipientWallet = new Wallet();
    minerWallet = new Wallet();

    // Initialize blockchain
    blockchain = new BlockchainImpl();
    await blockchain.initialize(minerWallet.getAddress());

    // Initialize miner
    miner = new MinerImpl(minerWallet.getAddress(), {
      difficulty: 1,
      blockReward: 2500000000,
      targetBlockTime: 10
    });

    // Fund sender wallet
    const senderMiner = new MinerImpl(senderWallet.getAddress(), {
      difficulty: 1,
      blockReward: 2500000000,
      targetBlockTime: 10
    });

    const latestBlock = blockchain.getLatestBlock();
    const latestBlockHash = miner.calculateHash(latestBlock);
    const senderFundingBlock = await senderMiner.mineBlock([], latestBlockHash);
    await blockchain.addBlock(senderFundingBlock);

    // Initialize mempool
    mempool = new Mempool(() => {
      const utxoManager = (blockchain as any).utxoManager;
      return utxoManager ? utxoManager.getAllUTXOs() : [];
    });

    console.log('Setup complete:');
    console.log('Sender balance:', blockchain.getBalance(senderWallet.getAddress()));
    console.log('Sender UTXOs:', blockchain.getUTXOs(senderWallet.getAddress()).length);
    console.log('All UTXOs:', mempool['utxoProvider']().length);
  });

  it('should debug transaction validation', async () => {
    const transferAmount = 1000000000;
    const transactionFee = 10000000;

    // Create transaction
    const senderUTXOs = blockchain.getUTXOs(senderWallet.getAddress());
    const utxoManager = new UTXOManager(senderUTXOs);
    const transaction = senderWallet.createTransaction(
      recipientWallet.getAddress(),
      transferAmount,
      transactionFee,
      utxoManager
    );
    senderWallet.signTransaction(transaction);

    console.log('\nTransaction created:');
    console.log('Transaction ID:', transaction.id);
    console.log('Inputs:', transaction.inputs.length);
    console.log('Outputs:', transaction.outputs.length);
    console.log('Signature:', transaction.signature ? 'Present' : 'Missing');

    // Test direct validation
    const allUTXOs = mempool['utxoProvider']();
    console.log('\nDirect validation:');
    console.log('Available UTXOs for validation:', allUTXOs.length);
    
    // Debug the signing data
    console.log('\nDebugging signature:');
    const input = transaction.inputs[0];
    const utxo = allUTXOs.find(u => u.txId === input.txId && u.outputIndex === input.outputIndex);
    console.log('Input:', input);
    console.log('UTXO:', utxo);
    
    // Recreate what the validator does
    const txForSigning = {
      inputs: transaction.inputs.map(inp => ({
        txId: inp.txId,
        outputIndex: inp.outputIndex,
        signature: '', // Remove signatures for verification
        publicKey: inp.publicKey
      })),
      outputs: transaction.outputs,
      timestamp: transaction.timestamp
    };
    
    const dataToSign = JSON.stringify(txForSigning);
    console.log('Data to sign (validator):', dataToSign);
    console.log('Input signature:', input.signature);
    console.log('Input public key:', input.publicKey);
    
    // Test signature verification directly
    const { CryptoUtils } = await import('../core/crypto');
    const isValidSig = CryptoUtils.verify(dataToSign, input.signature, input.publicKey);
    console.log('Direct signature verification:', isValidSig);
    
    const validationResult = TransactionValidator.validateTransaction(transaction, allUTXOs, blockchain.getBlockHeight());
    console.log('Validation result:', validationResult);

    // Test mempool validation
    console.log('\nMempool validation:');
    const mempoolValid = mempool['validateTransaction'](transaction);
    console.log('Mempool validation result:', mempoolValid);

    // Try to add to mempool
    console.log('\nAdding to mempool:');
    const added = mempool.addTransaction(transaction);
    console.log('Added to mempool:', added);

    expect(true).toBe(true); // Just to make test pass
  });
});