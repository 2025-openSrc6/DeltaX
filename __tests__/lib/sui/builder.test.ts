import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.hoisted를 사용하여 mock 함수를 호이스팅
const {
  mockMergeCoins,
  mockSplitCoins,
  mockMoveCall,
  mockSetSender,
  mockObject,
  mockPureAddress,
  mockPureU8,
  mockPureU64,
} = vi.hoisted(() => ({
  mockMergeCoins: vi.fn(),
  mockSplitCoins: vi.fn(),
  mockMoveCall: vi.fn(),
  mockSetSender: vi.fn(),
  mockObject: vi.fn((id: string) => ({ objectId: id })),
  mockPureAddress: vi.fn((addr: string) => ({ address: addr })),
  mockPureU8: vi.fn((val: number) => ({ u8: val })),
  mockPureU64: vi.fn((val: bigint) => ({ u64: val })),
}));

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: class MockTransaction {
    mergeCoins = mockMergeCoins;
    splitCoins = mockSplitCoins;
    moveCall = mockMoveCall;
    setSender = mockSetSender;
    object = mockObject;
    pure = {
      address: mockPureAddress,
      u8: mockPureU8,
      u64: mockPureU64,
    };
  },
}));

// Now import the builder
import { buildPlaceBetTx } from '@/lib/sui/builder';

describe('buildPlaceBetTx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // splitCoins returns a tuple with the split coin
    mockSplitCoins.mockReturnValue([{ splitCoin: 'split-result' }]);
  });

  describe('단일 코인 사용', () => {
    it('코인이 1개일 때 mergeCoins를 호출하지 않는다', () => {
      buildPlaceBetTx({
        userAddress: '0xUser123',
        poolId: '0xPool456',
        prediction: 1,
        userDelCoinIds: ['0xCoin1'],
        amount: BigInt(500_000_000_000), // 500 DEL
      });

      // mergeCoins should NOT be called
      expect(mockMergeCoins).not.toHaveBeenCalled();

      // splitCoins should be called with the single coin
      expect(mockSplitCoins).toHaveBeenCalledTimes(1);

      // moveCall should be called for place_bet
      expect(mockMoveCall).toHaveBeenCalledTimes(1);

      // setSender should be called
      expect(mockSetSender).toHaveBeenCalledWith('0xUser123');
    });

    it('splitCoins에 정확한 금액이 전달된다', () => {
      const amount = BigInt(500_000_000_000);

      buildPlaceBetTx({
        userAddress: '0xUser123',
        poolId: '0xPool456',
        prediction: 1,
        userDelCoinIds: ['0xCoin1'],
        amount,
      });

      // Check splitCoins was called with correct amount
      expect(mockSplitCoins).toHaveBeenCalledWith(
        expect.anything(), // primary coin object
        [expect.anything()], // amount array
      );
      expect(mockPureU64).toHaveBeenCalledWith(amount);
    });
  });

  describe('여러 코인 머지', () => {
    it('코인이 2개일 때 mergeCoins를 호출한다', () => {
      buildPlaceBetTx({
        userAddress: '0xUser123',
        poolId: '0xPool456',
        prediction: 2,
        userDelCoinIds: ['0xCoin1', '0xCoin2'],
        amount: BigInt(500_000_000_000),
      });

      // mergeCoins should be called
      expect(mockMergeCoins).toHaveBeenCalledTimes(1);
      expect(mockMergeCoins).toHaveBeenCalledWith(
        expect.anything(), // primary coin
        [expect.anything()], // rest coins array
      );

      // splitCoins should still be called
      expect(mockSplitCoins).toHaveBeenCalledTimes(1);

      // moveCall should be called
      expect(mockMoveCall).toHaveBeenCalledTimes(1);
    });

    it('코인이 3개일 때 2개를 첫 번째 코인에 머지한다', () => {
      buildPlaceBetTx({
        userAddress: '0xUser123',
        poolId: '0xPool456',
        prediction: 1,
        userDelCoinIds: ['0xCoin1', '0xCoin2', '0xCoin3'],
        amount: BigInt(700_000_000_000),
      });

      // mergeCoins should be called with 2 source coins
      expect(mockMergeCoins).toHaveBeenCalledTimes(1);
      expect(mockMergeCoins).toHaveBeenCalledWith(
        expect.anything(), // primary coin (0xCoin1)
        expect.arrayContaining([expect.anything(), expect.anything()]), // [0xCoin2, 0xCoin3]
      );
    });
  });

  describe('에러 케이스', () => {
    it('빈 코인 배열일 때 에러를 던진다', () => {
      expect(() =>
        buildPlaceBetTx({
          userAddress: '0xUser123',
          poolId: '0xPool456',
          prediction: 1,
          userDelCoinIds: [],
          amount: BigInt(500_000_000_000),
        }),
      ).toThrow('At least one DEL coin is required');
    });
  });

  describe('place_bet moveCall', () => {
    it('split된 코인이 place_bet 인자로 전달된다', () => {
      const splitResult = { splitCoin: 'payment-coin' };
      mockSplitCoins.mockReturnValue([splitResult]);

      buildPlaceBetTx({
        userAddress: '0xUser123',
        poolId: '0xPool456',
        prediction: 1,
        userDelCoinIds: ['0xCoin1'],
        amount: BigInt(500_000_000_000),
      });

      // moveCall should receive the split coin result
      expect(mockMoveCall).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.stringContaining('::betting::place_bet'),
          arguments: expect.arrayContaining([splitResult]),
        }),
      );
    });

    it('prediction 값이 u8로 전달된다', () => {
      buildPlaceBetTx({
        userAddress: '0xUser123',
        poolId: '0xPool456',
        prediction: 2, // BTC
        userDelCoinIds: ['0xCoin1'],
        amount: BigInt(500_000_000_000),
      });

      expect(mockPureU8).toHaveBeenCalledWith(2);
    });
  });
});
