import { NetworkMessage, Transaction, Block } from '../interfaces';
import { EventEmitter } from 'events';

export class ProtocolHandler extends EventEmitter {
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  constructor() {
    super();
    this.setupDefaultHandlers();
  }

  private setupDefaultHandlers(): void {
    this.messageHandlers.set('ping', (data) => {
      this.emit('ping', data);
    });

    this.messageHandlers.set('pong', (data) => {
      this.emit('pong', data);
    });

    this.messageHandlers.set('transaction', (data) => {
      if (this.isValidTransaction(data)) {
        this.emit('transaction', data);
      } else {
        this.emit('invalidMessage', { type: 'transaction', data });
      }
    });

    this.messageHandlers.set('block', (data) => {
      if (this.isValidBlock(data)) {
        this.emit('block', data);
      } else {
        this.emit('invalidMessage', { type: 'block', data });
      }
    });

    this.messageHandlers.set('getBlocks', (data) => {
      this.emit('getBlocks', data);
    });

    this.messageHandlers.set('getBlock', (data) => {
      this.emit('getBlock', data);
    });

    this.messageHandlers.set('blocks', (data) => {
      if (this.isValidBlocksResponse(data)) {
        this.emit('blocks', data);
      } else {
        this.emit('invalidMessage', { type: 'blocks', data });
      }
    });

    this.messageHandlers.set('blockNotFound', (data) => {
      this.emit('blockNotFound', data);
    });
  }

  handleMessage(message: NetworkMessage): void {
    if (!this.isValidMessage(message)) {
      this.emit('invalidMessage', message);
      return;
    }

    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      try {
        handler(message.data);
      } catch (error) {
        this.emit('error', new Error(`Error handling ${message.type} message: ${error}`));
      }
    } else {
      this.emit('unknownMessage', message);
    }
  }

  createMessage(type: NetworkMessage['type'], data: any): NetworkMessage {
    return {
      type,
      data,
      timestamp: Date.now()
    };
  }

  // Message validation methods
  private isValidMessage(message: NetworkMessage): boolean {
    return message &&
           typeof message.type === 'string' &&
           message.data !== undefined &&
           typeof message.timestamp === 'number' &&
           message.timestamp > 0;
  }

  private isValidTransaction(data: any): data is Transaction {
    return data &&
           typeof data.id === 'string' &&
           Array.isArray(data.inputs) &&
           Array.isArray(data.outputs) &&
           typeof data.timestamp === 'number' &&
           data.inputs.every(this.isValidTransactionInput) &&
           data.outputs.every(this.isValidTransactionOutput);
  }

  private isValidTransactionInput(input: any): boolean {
    return input &&
           typeof input.txId === 'string' &&
           typeof input.outputIndex === 'number' &&
           typeof input.signature === 'string' &&
           typeof input.publicKey === 'string';
  }

  private isValidTransactionOutput(output: any): boolean {
    return output &&
           typeof output.address === 'string' &&
           typeof output.amount === 'number' &&
           output.amount > 0;
  }

  private isValidBlock(data: any): data is Block {
    return data &&
           this.isValidBlockHeader(data.header) &&
           Array.isArray(data.transactions) &&
           data.transactions.every((tx: any) => this.isValidTransaction(tx));
  }

  private isValidBlockHeader(header: any): boolean {
    return header &&
           typeof header.version === 'number' &&
           typeof header.previousHash === 'string' &&
           typeof header.merkleRoot === 'string' &&
           typeof header.timestamp === 'number' &&
           typeof header.difficulty === 'number' &&
           typeof header.nonce === 'number';
  }

  private isValidBlocksResponse(data: any): boolean {
    return data &&
           Array.isArray(data.blocks) &&
           typeof data.startHeight === 'number' &&
           typeof data.totalBlocks === 'number' &&
           data.blocks.every((block: any) => this.isValidBlock(block));
  }

  // Register custom message handlers
  registerHandler(messageType: string, handler: (data: any) => void): void {
    this.messageHandlers.set(messageType, handler);
  }

  // Remove message handlers
  unregisterHandler(messageType: string): void {
    this.messageHandlers.delete(messageType);
  }

  // Get supported message types
  getSupportedMessageTypes(): string[] {
    return Array.from(this.messageHandlers.keys());
  }
}