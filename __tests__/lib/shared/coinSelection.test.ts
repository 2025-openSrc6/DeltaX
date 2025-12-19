import { describe, expect, it } from 'vitest';
import { selectCoinsForAmount, MIST_PER_DEL } from '@/lib/shared/coinSelection';

describe('selectCoinsForAmount', () => {
  // 헬퍼: DEL을 MIST 문자열로 변환
  const delToMist = (del: number): string => (BigInt(del) * MIST_PER_DEL).toString();

  describe('단일 코인으로 충분한 경우', () => {
    it('가장 큰 단일 코인을 선택한다', () => {
      const coins = [
        { coinObjectId: '0xCoin1', balance: delToMist(100) },
        { coinObjectId: '0xCoin2', balance: delToMist(500) },
        { coinObjectId: '0xCoin3', balance: delToMist(200) },
      ];

      const result = selectCoinsForAmount(coins, 300);

      // 500 DEL 코인 하나로 충분
      expect(result).toEqual(['0xCoin2']);
    });

    it('정확히 필요한 금액과 같은 코인보다 큰 코인이 있으면 큰 것을 선택한다', () => {
      const coins = [
        { coinObjectId: '0xCoin1', balance: delToMist(100) },
        { coinObjectId: '0xCoin2', balance: delToMist(500) },
        { coinObjectId: '0xCoin3', balance: delToMist(300) },
      ];

      const result = selectCoinsForAmount(coins, 300);

      // 정렬 후 첫 번째 충분한 코인 (500 DEL, 가장 큰 것)
      expect(result).toEqual(['0xCoin2']);
    });

    it('모든 코인이 충분할 때 가장 큰 코인을 선택한다', () => {
      const coins = [
        { coinObjectId: '0xCoin1', balance: delToMist(1000) },
        { coinObjectId: '0xCoin2', balance: delToMist(500) },
        { coinObjectId: '0xCoin3', balance: delToMist(200) },
      ];

      const result = selectCoinsForAmount(coins, 100);

      // 정렬 후 첫 번째 충분한 코인 (가장 큰 것)
      expect(result).toEqual(['0xCoin1']);
    });
  });

  describe('여러 코인 머지 필요', () => {
    it('2개 코인을 합쳐야 할 때', () => {
      const coins = [
        { coinObjectId: '0xCoin1', balance: delToMist(100) },
        { coinObjectId: '0xCoin2', balance: delToMist(200) },
        { coinObjectId: '0xCoin3', balance: delToMist(300) },
      ];

      const result = selectCoinsForAmount(coins, 400);

      // 300 + 200 = 500 >= 400
      expect(result).toEqual(['0xCoin3', '0xCoin2']);
    });

    it('3개 코인을 합쳐야 할 때', () => {
      const coins = [
        { coinObjectId: '0xCoin1', balance: delToMist(100) },
        { coinObjectId: '0xCoin2', balance: delToMist(200) },
        { coinObjectId: '0xCoin3', balance: delToMist(300) },
      ];

      const result = selectCoinsForAmount(coins, 550);

      // 300 + 200 + 100 = 600 >= 550
      expect(result).toEqual(['0xCoin3', '0xCoin2', '0xCoin1']);
    });

    it('모든 코인을 합쳐야 할 때', () => {
      const coins = [
        { coinObjectId: '0xCoin1', balance: delToMist(100) },
        { coinObjectId: '0xCoin2', balance: delToMist(200) },
        { coinObjectId: '0xCoin3', balance: delToMist(300) },
      ];

      const result = selectCoinsForAmount(coins, 600);

      // 모든 코인 필요
      expect(result).toHaveLength(3);
    });
  });

  describe('에러 케이스', () => {
    it('코인이 없으면 에러를 던진다', () => {
      expect(() => selectCoinsForAmount([], 100)).toThrow('DEL 토큰이 없습니다');
    });

    it('잔액이 부족하면 에러를 던진다', () => {
      const coins = [
        { coinObjectId: '0xCoin1', balance: delToMist(100) },
        { coinObjectId: '0xCoin2', balance: delToMist(200) },
      ];

      expect(() => selectCoinsForAmount(coins, 500)).toThrow(/잔액이 부족합니다/);
    });

    it('잔액 부족 에러 메시지에 보유/필요 금액이 포함된다', () => {
      const coins = [
        { coinObjectId: '0xCoin1', balance: delToMist(100) },
        { coinObjectId: '0xCoin2', balance: delToMist(200) },
      ];

      expect(() => selectCoinsForAmount(coins, 500)).toThrow('보유: 300 DEL, 필요: 500 DEL');
    });
  });

  describe('엣지 케이스', () => {
    it('코인이 1개뿐이고 충분할 때', () => {
      const coins = [{ coinObjectId: '0xCoin1', balance: delToMist(1000) }];

      const result = selectCoinsForAmount(coins, 500);

      expect(result).toEqual(['0xCoin1']);
    });

    it('코인이 1개뿐이고 정확히 같을 때', () => {
      const coins = [{ coinObjectId: '0xCoin1', balance: delToMist(500) }];

      const result = selectCoinsForAmount(coins, 500);

      expect(result).toEqual(['0xCoin1']);
    });

    it('코인이 1개뿐이고 부족할 때', () => {
      const coins = [{ coinObjectId: '0xCoin1', balance: delToMist(100) }];

      expect(() => selectCoinsForAmount(coins, 500)).toThrow(/잔액이 부족합니다/);
    });

    it('최소 베팅 금액 (100 DEL)', () => {
      const coins = [{ coinObjectId: '0xCoin1', balance: delToMist(100) }];

      const result = selectCoinsForAmount(coins, 100);

      expect(result).toEqual(['0xCoin1']);
    });

    it('아주 작은 코인들 여러 개', () => {
      const coins = [
        { coinObjectId: '0xCoin1', balance: delToMist(50) },
        { coinObjectId: '0xCoin2', balance: delToMist(50) },
        { coinObjectId: '0xCoin3', balance: delToMist(50) },
      ];

      const result = selectCoinsForAmount(coins, 100);

      // 50 + 50 = 100
      expect(result).toHaveLength(2);
    });
  });

  describe('정렬 동작', () => {
    it('입력 순서와 관계없이 큰 순서로 선택한다', () => {
      const coins = [
        { coinObjectId: '0xSmall', balance: delToMist(100) },
        { coinObjectId: '0xLarge', balance: delToMist(1000) },
        { coinObjectId: '0xMedium', balance: delToMist(500) },
      ];

      const result = selectCoinsForAmount(coins, 200);

      // 가장 큰 1000 DEL 코인 선택
      expect(result).toEqual(['0xLarge']);
    });

    it('머지 시에도 큰 순서로 선택한다', () => {
      const coins = [
        { coinObjectId: '0xSmall', balance: delToMist(100) },
        { coinObjectId: '0xLarge', balance: delToMist(300) },
        { coinObjectId: '0xMedium', balance: delToMist(200) },
      ];

      const result = selectCoinsForAmount(coins, 400);

      // 300 + 200 = 500 >= 400 (큰 순서)
      expect(result).toEqual(['0xLarge', '0xMedium']);
    });
  });
});
