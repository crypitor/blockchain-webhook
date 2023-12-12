import { ethers } from 'ethers';

// Initialize provider
const provider = new ethers.JsonRpcProvider('');

// Define RPC methods
export const getBlockNumber = async (): Promise<number> => {
  const blockNumber = await provider.getBlockNumber();
  return blockNumber;
};

export const getBalance = async (address: string): Promise<string> => {
  const balance = await provider.getBalance(address);
  return balance.toString();
};

export const getTransactionCount = async (address: string): Promise<number> => {
  const transactionCount = await provider.getTransactionCount(address);
  return transactionCount;
};

// Define the getLogs function
export const getLogs = async (address: string, fromBlock: number, toBlock: number, topics: string[]): Promise<ethers.Log[]> => {
  const filter = {
    address: address,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: topics
  };

  const logs = await provider.getLogs(filter);
  return logs;
};

// Example usage
(async () => {
  try {
    const blockNumber = await getBlockNumber();
    console.log('Current block number:', blockNumber);

    const address = '0x1234567890abcdef';
    const balance = await getBalance(address);
    console.log(`Balance of ${address}:`, balance);

    const transactionCount = await getTransactionCount(address);
    console.log(`Transaction count of ${address}:`, transactionCount);
  } catch (error) {
    console.error('Error:', error);
  }
})();