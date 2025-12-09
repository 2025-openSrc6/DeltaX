/**
 * BetService - 베팅 비즈니스 로직 레이어
 *
 * 책임:
 * - 입력 검증 (Zod)
 * - 비즈니스 로직 (베팅 가능 여부 판단)
 * - Repository 조합
 * - 비즈니스 에러 발생
 *
 * 금지 사항:
 * - HTTP 의존성 ❌
 * - 직접 SQL 작성 ❌
 */

import { BetRepository } from './repository';
import { RoundRepository } from '@/lib/rounds/repository';
import { createBetWithSuiPrepareSchema, getBetsQuerySchema } from './validation';
import { NotFoundError, BusinessRuleError, ValidationError } from '@/lib/shared/errors';
import { generateUUID, isValidUUID } from '@/lib/shared/uuid';
import type {
  GetBetsResult,
  BetQueryParams,
  BetWithRound,
  ValidatedCreateBetOffchainInput,
  FinalizeBetExecutionInput,
} from './types';
import type { Bet } from '@/db/schema/bets';
import type { Round } from '@/db/schema/rounds';
import type { PrepareSuiBetTxResult, ExecuteSuiBetTxResult } from '@/lib/sui/types';
import { SuiService } from '@/lib/sui/service';
import { executeSuiBetTxSchema } from '../sui/validation';

export class BetService {
  private betRepository: BetRepository;
  private roundRepository: RoundRepository;
  private suiService: SuiService;

  constructor(
    betRepository: BetRepository,
    roundRepository: RoundRepository,
    suiService: SuiService,
  ) {
    this.betRepository = betRepository;
    this.roundRepository = roundRepository;
    this.suiService = suiService;
  }

  private async assertRoundOpen(round: Round) {
    if (round.status !== 'BETTING_OPEN') {
      throw new BusinessRuleError('BETTING_CLOSED', 'Betting is closed', {
        roundStatus: round.status,
        roundId: round.id,
      });
    }
    const now = Date.now();
    if (now >= round.lockTime) {
      throw new BusinessRuleError('BETTING_CLOSED', 'Betting time has ended', {
        now,
        lockTime: round.lockTime,
        timeRemaining: round.lockTime - now,
      });
    }
  }

  private async createPendingBet(
    input: ValidatedCreateBetOffchainInput,
    preloadedRound?: Round,
  ): Promise<Bet> {
    const { roundId, prediction, amount, userId } = input;
    const round = preloadedRound ?? (await this.roundRepository.findById(roundId));
    if (!round) {
      throw new NotFoundError('Round', roundId);
    }

    await this.assertRoundOpen(round);

    try {
      const betId = generateUUID();
      const createdAt = Date.now();
      const bet = await this.betRepository.createPending({
        id: betId,
        roundId,
        userId,
        prediction,
        amount,
        createdAt,
      });
      return bet;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if ((error as { code?: string }).code === 'ALREADY_EXISTS') {
          throw new BusinessRuleError(
            'ALREADY_BET',
            'You have already placed a bet on this round.',
          );
        }
      }
      throw error;
    }
  }

  async createBetWithSuiPrepare(
    rawInput: unknown,
    userId: string,
  ): Promise<PrepareSuiBetTxResult & { betId: string }> {
    const { roundId, prediction, amount, userAddress, userDelCoinId } =
      createBetWithSuiPrepareSchema.parse(rawInput);

    // 라운드 단일 조회 (poolId 확보 + 상태/시간 검증은 createBet에서 재사용)
    const round = await this.roundRepository.findById(roundId);
    if (!round) {
      throw new NotFoundError('Round', roundId);
    }
    const poolId = round.suiPoolAddress;
    if (!poolId) {
      throw new NotFoundError('Pool', roundId);
    }

    const bet = await this.createPendingBet(
      {
        roundId,
        prediction,
        amount,
        userId,
      },
      round,
    );

    const prepareSuiBetTxResult = await this.suiService.prepareBetTransaction({
      userAddress,
      userDelCoinId,
      poolId,
      prediction: prediction === 'GOLD' ? 1 : 2,
      betId: bet.id,
      userId,
    });

    return { ...prepareSuiBetTxResult, betId: bet.id };
  }

  async executeBetWithUpdate(rawInput: unknown): Promise<ExecuteSuiBetTxResult> {
    const {
      txBytes: txBytesBase64,
      userSignature,
      nonce,
      betId,
      userId,
    } = executeSuiBetTxSchema.parse(rawInput);

    const bet = await this.betRepository.findById(betId);
    if (!bet) {
      throw new NotFoundError('Bet', betId);
    }
    if (bet.userId !== userId) {
      throw new BusinessRuleError('USER_MISMATCH', 'Prepared user does not match execution userId');
    }
    if (bet.chainStatus === 'EXECUTED') {
      return { digest: bet.suiTxHash ?? 'already-executed' };
    }

    const { digest } = await this.suiService.executeBetTransaction({
      txBytes: txBytesBase64,
      userSignature,
      nonce,
      betId,
      userId,
    });

    const finalizeInput: FinalizeBetExecutionInput = {
      betId,
      roundId: bet.roundId,
      userId: bet.userId,
      prediction: bet.prediction as 'GOLD' | 'BTC',
      amount: bet.amount,
      suiTxHash: digest,
    };

    await this.betRepository.finalizeExecution(finalizeInput);

    return { digest };
  }

  /**
   * 베팅 목록 조회
   */
  async getBets(rawParams: unknown): Promise<GetBetsResult> {
    // 1. 입력 검증 (Zod)
    const validated = getBetsQuerySchema.parse(rawParams);

    // 2. Repository 파라미터 변환
    const queryParams: BetQueryParams = {
      filters: {
        roundId: validated.roundId,
        userId: validated.userId,
        prediction: validated.prediction,
        resultStatus: validated.resultStatus,
        settlementStatus: validated.settlementStatus,
      },
      sort: validated.sort,
      order: validated.order,
      limit: validated.pageSize,
      offset: (validated.page - 1) * validated.pageSize,
    };

    // 3. Repository 호출
    const bets = await this.betRepository.findMany(queryParams);
    const total = await this.betRepository.count(queryParams);

    // 4. 메타데이터 계산
    const totalPages = total > 0 ? Math.ceil(total / validated.pageSize) : 0;

    // 5. 결과 반환
    return {
      bets,
      meta: {
        page: validated.page,
        pageSize: validated.pageSize,
        total,
        totalPages,
      },
    };
  }

  /**
   * 특정 베팅 조회 (라운드 정보 포함)
   *
   * @param id - 베팅 UUID
   * @returns 베팅 정보 (with Round)
   */
  async getBetById(id: string): Promise<BetWithRound> {
    // 1. UUID 검증
    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid UUID format', { id });
    }

    // 2. 베팅 조회
    const bet = await this.betRepository.findById(id);
    if (!bet) {
      throw new NotFoundError('Bet', id);
    }

    // 3. 라운드 조회
    const round = await this.roundRepository.findById(bet.roundId);
    // 라운드가 없으면 데이터 무결성 문제이나 일단 에러 처리
    if (!round) {
      throw new NotFoundError('Round for bet', bet.roundId);
    }

    return {
      ...bet,
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        type: round.type,
        status: round.status,
        startTime: round.startTime,
        endTime: round.endTime,
      },
    };
  }

  /**
   * 베팅 업데이트 (일반)
   *
   * @param id - 베팅 UUID
   * @param updateData - 업데이트 데이터
   * @returns 업데이트된 베팅
   */
  async updateBet(id: string, updateData: Partial<Bet>): Promise<Bet> {
    return await this.betRepository.updateById(id, updateData);
  }

  /**
   * 베팅 정산 결과 업데이트 (Job 5 전용)
   *
   * 멱등성 보장: 이미 COMPLETED인 베팅은 스킵하도록 호출자가 처리
   *
   * @param betId - 베팅 UUID
   * @param result - 정산 결과
   * @returns 업데이트된 베팅
   */
  async updateBetSettlement(
    betId: string,
    result: {
      resultStatus: 'WON' | 'LOST' | 'REFUNDED';
      settlementStatus: 'COMPLETED' | 'FAILED';
      payoutAmount: number;
    },
  ): Promise<Bet> {
    return this.betRepository.updateById(betId, {
      resultStatus: result.resultStatus,
      settlementStatus: result.settlementStatus,
      payoutAmount: result.payoutAmount,
      settledAt: Date.now(),
    });
  }

  /**
   * 라운드의 모든 베팅 조회 (정산용)
   *
   * @param roundId - 라운드 UUID
   * @returns 베팅 배열
   */
  async findBetsByRoundId(roundId: string): Promise<Bet[]> {
    return this.betRepository.findByRoundId(roundId);
  }
}
