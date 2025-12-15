/**
 * RoundService - 라운드 비즈니스 로직 레이어
 *
 * 책임:
 * - 입력 검증 (Zod)
 * - 비즈니스 로직 (계산, 판단, 변환)
 * - Repository 조합
 * - 비즈니스 에러 발생
 *
 * 금지 사항:
 * - HTTP 의존성 (NextRequest, NextResponse) ❌
 * - 직접 SQL 작성 ❌
 * - 프레임워크 종속 코드 ❌
 */

import { RoundRepository } from './repository';
import { BetService } from '@/lib/bets/service';
import { createRoundSchema, getCurrentRoundQuerySchema, getRoundsQuerySchema } from './validation';
import {
  ValidationError,
  NotFoundError,
  BusinessRuleError,
  ServiceError,
} from '@/lib/shared/errors';
import { generateUUID, isValidUUID } from '@/lib/shared/uuid';
import type {
  GetRoundsResult,
  RoundStatus,
  Round,
  RoundInsert,
  RoundQueryParams,
  RoundType,
  PriceData,
  OpenRoundResult,
  LockRoundResult,
  FinalizeRoundResult,
  CalculatePayoutResult,
  SettleRoundResult,
  RecoveryRoundsResult,
} from './types';
import { BETTING_DURATIONS_MS, RETRY_START_THRESHOLD_MS, ROUND_DURATIONS_MS } from './constants';
import { transitionRoundStatus } from './fsm';
import { cronLogger } from '@/lib/cron/logger';
import { calculatePayout } from './calculator';
import { createPool, finalizeRound as finalizeRoundOnChain, lockPool } from '@/lib/sui/admin';
import { toJSON } from '@/lib/sui/utils';
import { calculateSettlementAvgVol } from './avgVol.service';

export class RoundService {
  private repository: RoundRepository;
  private betService: BetService;

  constructor(repository: RoundRepository, betService: BetService) {
    // Dependency Injection: 테스트 시 Mock 주입 가능
    this.repository = repository;
    this.betService = betService;
  }

  /**
   * 라운드 목록 조회
   *
   * @param rawParams - 검증되지 않은 쿼리 파라미터
   * @returns 라운드 목록 + 페이지네이션 메타데이터
   *
   * @throws {ValidationError} 입력 검증 실패 시
   *
   * @example
   * const result = await roundService.getRounds({
   *   type: '6HOUR',
   *   statuses: ['BETTING_OPEN', 'BETTING_LOCKED'],
   *   page: 1,
   *   pageSize: 20,
   * });
   */
  async getRounds(rawParams: unknown): Promise<GetRoundsResult> {
    // 1. 입력 검증 (Zod)
    const validated = getRoundsQuerySchema.parse(rawParams);

    // 2. Repository 파라미터 변환
    // Zod에서 이미 타입을 검증했으므로 안전하게 타입 단언
    const queryParams: RoundQueryParams = {
      filters: {
        type: validated.type as RoundType | undefined,
        statuses: validated.statuses as RoundStatus[] | undefined,
      },
      sort: validated.sort as 'start_time' | 'round_number',
      order: validated.order as 'asc' | 'desc',
      limit: validated.pageSize,
      offset: (validated.page - 1) * validated.pageSize,
    };

    // 3. Repository 호출 (병렬 실행)
    const [rounds, total] = await Promise.all([
      this.repository.findMany(queryParams),
      this.repository.count(queryParams),
    ]);

    // 4. 메타데이터 계산
    const totalPages = total > 0 ? Math.ceil(total / validated.pageSize) : 0;

    // 5. 결과 반환
    return {
      rounds,
      meta: {
        page: validated.page,
        pageSize: validated.pageSize,
        total,
        totalPages,
      },
    };
  }

  /**
   * 특정 라운드 조회
   *
   * @param id - 라운드 UUID
   * @returns 라운드 정보
   *
   * @throws {ValidationError} UUID 형식 오류 시
   * @throws {NotFoundError} 라운드가 존재하지 않을 시
   *
   * @example
   * const round = await roundService.getRoundById('uuid-123');
   */
  async getRoundById(id: string): Promise<Round> {
    // 1. UUID 형식 검증 (공통 유틸리티 사용)
    if (!isValidUUID(id)) {
      throw new ValidationError('Invalid UUID format', { id });
    }

    // 2. Repository 호출
    const round = await this.repository.findById(id);

    // 3. 존재 여부 확인
    if (!round) {
      throw new NotFoundError('Round', id);
    }

    return round;
  }

  async getCurrentRound(rawType: unknown): Promise<
    Round & {
      timeRemaining: number;
      bettingTimeRemaining: number;
      goldBetsPercentage: string;
      btcBetsPercentage: string;
      canBet: boolean;
      bettingClosesIn: string;
    }
  > {
    // 1. 입력 검증 (Zod)
    const validated = getCurrentRoundQuerySchema.parse({ type: rawType });
    const type = validated.type as RoundType;

    // 2. Repository 호출 - DB 쿼리
    const round = await this.repository.findCurrentRound(type);
    if (!round) {
      throw new NotFoundError('Current active round', type);
    }

    // UI용 필드 계산
    const now = Date.now(); // Epoch milliseconds

    // 시간 계산 (초 단위로 표시, 올림 처리로 더 안전하게)
    const timeRemaining = Math.max(0, Math.ceil((round.endTime - now) / 1000));
    const bettingTimeRemaining = Math.max(0, Math.ceil((round.lockTime - now) / 1000));

    // 베팅 비율 계산
    const totalPool = round.totalPool ?? 0;
    const totalGoldBets = round.totalGoldBets ?? 0;
    const totalBtcBets = round.totalBtcBets ?? 0;

    const goldBetsPercentage =
      totalPool > 0 ? ((totalGoldBets / totalPool) * 100).toFixed(2) : '0.00';
    const btcBetsPercentage =
      totalPool > 0 ? ((totalBtcBets / totalPool) * 100).toFixed(2) : '0.00';

    // 베팅 가능 여부
    const canBet = round.status === 'BETTING_OPEN' && now < round.lockTime;

    // MM:SS 형식 변환
    const bettingClosesIn = this.formatTimeMMSS(bettingTimeRemaining);

    // 5. 결과 반환
    return {
      ...round,
      timeRemaining,
      bettingTimeRemaining,
      goldBetsPercentage,
      btcBetsPercentage,
      canBet,
      bettingClosesIn,
    };
  }

  /**
   * 새 라운드 생성 (Admin 전용)
   *
   * Service에서 다음 작업 수행:
   * - 입력 검증 (Zod)
   * - endTime, lockTime 자동 계산
   * - roundNumber 자동 증가
   * - 중복 시간대 체크
   * - DB 삽입 (트랜잭션)
   *
   * @param rawParams - 검증되지 않은 입력 파라미터
   * @returns 생성된 라운드
   *
   * @throws {ValidationError} 입력 검증 실패 시
   * @throws {BusinessRuleError} 비즈니스 규칙 위반 시 (중복 시간대 등)
   * @throws {ServiceError} DB 오류 등
   */
  async createRound(rawParams: unknown): Promise<Round> {
    // 1. 입력 검증 (Zod)
    const validated = createRoundSchema.parse(rawParams);

    // 2. 시간 계산
    const startTime = validated.startTime;
    const type = validated.type as RoundType;

    // [개발용 임시] cron job 구현 후 status 제거
    const status = validated.status as RoundStatus | undefined;

    const endTime = startTime + ROUND_DURATIONS_MS[type];
    const lockTime = startTime + BETTING_DURATIONS_MS[type];

    // 3. 중복 체크 + roundNumber 증가 + 삽입
    // 주의: 트랜잭션 지원 안함

    try {
      // 3-1. 중복 시간대 체크
      const isOverlapping = await this.repository.checkOverlappingTime(startTime, endTime, type);
      if (isOverlapping) {
        throw new BusinessRuleError(
          'ROUND_TIME_OVERLAP',
          'A round already exists for this time period',
          {
            type,
            startTime,
            endTime,
          },
        );
      }

      // 3-2. 마지막 roundNumber 조회
      const lastRoundNumber = await this.repository.getLastRoundNumber(type);
      const roundNumber = lastRoundNumber + 1;

      // 3-3. 라운드 객체 생성
      const roundData: RoundInsert = {
        id: generateUUID(),
        roundNumber,
        type,
        status: status ?? 'SCHEDULED',
        startTime,
        endTime,
        lockTime,
        // 나머지 필드는 기본값 (생략)
      };

      // 3-4. 라운드 삽입
      return await this.repository.insert(roundData);
    } catch (error) {
      // 비즈니스 에러는 그대로 재발생
      if (error instanceof BusinessRuleError || error instanceof ValidationError) {
        throw error;
      }

      // DB 에러를 ServiceError로 변환
      if (error instanceof Error) {
        // UNIQUE constraint 위반 등
        if (error.message.includes('UNIQUE') || error.message.includes('unique')) {
          throw new BusinessRuleError('ROUND_ALREADY_EXISTS', 'Round already exists', {
            originalError: error.message,
          });
        }

        // 기타 DB 에러
        throw new ServiceError('DATABASE_ERROR', 'Failed to create round', {
          originalError: error.message,
        });
      }

      // 알 수 없는 에러
      throw error;
    }
  }

  /**
   * 라운드 상태 업데이트
   *
   * @param roundId 라운드 ID
   * @param status 새로운 상태
   * @param metadata 추가 업데이트 데이터 (선택)
   * @returns 업데이트된 라운드
   */
  async updateRoundById(roundId: string, updateData: Partial<Round>): Promise<Round> {
    return await this.repository.updateById(roundId, updateData);
  }

  /**
   * 다음 라운드 생성
   * @returns 생성된 라운드
   */
  async createNextScheduledRound(): Promise<Round> {
    const type: RoundType = '6HOUR';
    const lastRound = await this.repository.findLastRound(type);

    let roundNumber: number;
    let startTime: number;

    if (!lastRound) {
      // 첫 라운드: KST 02/08/14/20시에 맞춘 6시간 슬롯으로 올림
      startTime = this.getNextAnchoredStartTime(Date.now());
      roundNumber = 1;
    } else {
      startTime = lastRound.startTime + ROUND_DURATIONS_MS[type];
      roundNumber = lastRound.roundNumber + 1;
    }

    // 중복 체크
    const existing = await this.repository.findByStartTime(type, startTime);
    if (existing) {
      return existing;
    }

    const endTime = startTime + ROUND_DURATIONS_MS[type];
    const lockTime = startTime + BETTING_DURATIONS_MS[type];
    const now = Date.now();

    const roundData: RoundInsert = {
      id: generateUUID(),
      roundNumber,
      type,
      status: 'SCHEDULED',
      startTime,
      endTime,
      lockTime,
      createdAt: now,
      updatedAt: now,
    };

    return await this.repository.insert(roundData);
  }

  /**
   * 가장 최근 SCHEDULED 라운드 1개 찾기
   *
   * 왜 "모든 SCHEDULED"가 아닌 "가장 최근 1개"인가?
   * - 정상 상황: 항상 1개만 존재
   * - 비정상 상황: 이전 라운드가 밀려있으면 CANCEL 대상
   */
  async findLatestScheduledRound(): Promise<Round | null> {
    return await this.repository.findLatestByStatus('SCHEDULED');
  }

  /**
   * 라운드 취소 (FSM 래핑)
   *
   * 취소는 여러 곳에서 호출되므로 Service에서 래핑
   */
  async cancelRound(
    roundId: string,
    params: {
      reason: string;
      message: string;
      cancelledBy: 'SYSTEM' | 'ADMIN';
    },
  ): Promise<Round> {
    return transitionRoundStatus(roundId, 'CANCELLED', {
      cancellationReason: params.reason,
      cancellationMessage: params.message,
      cancelledBy: params.cancelledBy,
      cancelledAt: Date.now(),
    });
  }

  /**
   * 라운드 오픈 (Job 2: Round Opener)
   *
   * 책임:
   * 1. 가장 최근 SCHEDULED 라운드 찾기
   * 2. 시간 검증 (startTime <= now < lockTime)
   * 3. 상태 전이 (SCHEDULED → BETTING_OPEN) - FSM 호출
   * 4. lockTime 경과 시 자동 취소
   *
   * @param prices - 외부 API에서 가져온 가격 데이터
   * @returns OpenRoundResult
   */
  async openRound(prices: PriceData): Promise<OpenRoundResult> {
    cronLogger.info('[Job 2] Starting', { prices });

    // 가장 최근 SCHEDULED 라운드 찾기
    const round = await this.findLatestScheduledRound();
    if (!round) {
      cronLogger.info('[Job 2] No scheduled round found');
      return { status: 'no_round', message: 'No scheduled round found' };
    }

    cronLogger.info('[Job 2] Found round', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      startTime: new Date(round.startTime).toISOString(),
      lockTime: new Date(round.lockTime).toISOString(),
    });

    const now = Date.now();

    // startTime 아직 안 됐으면 스킵
    if (round.startTime > now) {
      cronLogger.info('[Job 2] Round not ready yet', {
        roundId: round.id,
        startTime: new Date(round.startTime).toISOString(),
        now: new Date(now).toISOString(),
      });
      return {
        status: 'not_ready',
        round,
        message: 'Round not ready yet (startTime not reached)',
      };
    }

    // lockTime 이미 지났으면 CANCEL (복구 안함)
    if (now >= round.lockTime) {
      cronLogger.warn('[Job 2] lockTime passed, cancelling', {
        roundId: round.id,
        lockTime: new Date(round.lockTime).toISOString(),
        now: new Date(now).toISOString(),
      });
      const cancelledRound = await this.cancelRound(round.id, {
        reason: 'MISSED_OPEN_WINDOW',
        message: 'lockTime 경과로 자동 취소',
        cancelledBy: 'SYSTEM',
      });
      cronLogger.info('[Job 2] Round cancelled', { roundId: round.id });
      return {
        status: 'cancelled',
        round: cancelledRound,
        message: 'Round cancelled (missed open window)',
      };
    }

    // ------------------------------
    // Sui-first: create_pool (idempotent)
    // ------------------------------
    //
    // 목표:
    // - on-chain BettingPool을 먼저 만든 뒤(poolId/txDigest 확보)
    // - DB에 최소 키(suiPoolAddress, suiCreatePoolTxDigest)를 먼저 저장
    // - 그 다음 FSM 전이 + 가격 메타 저장
    //
    // 이유:
    // - "체인 성공, DB 실패" 상황에서 최소한 poolId라도 남겨 재시도/복구 가능하게
    //
    let poolId = round.suiPoolAddress ?? undefined;
    let createPoolTxDigest: string | undefined;
    if (!poolId) {
      const created = await createPool(round.roundNumber, round.lockTime, round.endTime);
      poolId = created.poolId;
      createPoolTxDigest = created.txDigest;

      // poolId/txDigest를 먼저 저장 (idempotency)
      await this.repository.updateById(round.id, {
        suiPoolAddress: poolId,
        suiCreatePoolTxDigest: createPoolTxDigest,
      });
    }

    // 가격 메타는 JSON text로 저장 (없으면 undefined)
    const priceSnapshotMeta =
      prices.meta !== undefined ? JSON.stringify(toJSON(prices.meta)) : undefined;

    // 상태 전이 (SCHEDULED → BETTING_OPEN)
    cronLogger.info('[Job 2] Transitioning to BETTING_OPEN', {
      roundId: round.id,
    });
    const openedRound = await transitionRoundStatus(round.id, 'BETTING_OPEN', {
      goldStartPrice: prices.gold.toString(),
      btcStartPrice: prices.btc.toString(),
      priceSnapshotStartAt: prices.timestamp,
      startPriceSource: prices.source,
      priceSnapshotMeta,
      suiPoolAddress: poolId,
      suiCreatePoolTxDigest: createPoolTxDigest,
      bettingOpenedAt: Date.now(),
    });

    cronLogger.info('[Job 2] Success', {
      roundId: openedRound.id,
      status: openedRound.status,
    });

    return {
      status: 'opened',
      round: openedRound,
    };
  }

  async lockRound(): Promise<LockRoundResult> {
    cronLogger.info('[Job 3] Starting');

    const round = await this.repository.findLatestByStatus('BETTING_OPEN');
    if (!round) {
      cronLogger.info('[Job 3] No open round found');
      return { status: 'no_round', message: 'No open round found' };
    }

    cronLogger.info('[Job 3] Found round', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      lockTime: new Date(round.lockTime).toISOString(),
    });

    // 시간 조건
    const now = Date.now();
    if (round.lockTime > now) {
      cronLogger.info('[Job 3] Round not ready to lock yet', {
        roundId: round.id,
        lockTime: new Date(round.lockTime).toISOString(),
        now: new Date(now).toISOString(),
      });
      return { status: 'not_ready', round, message: 'Round not ready to lock yet' };
    }

    // ------------------------------
    // Sui-first: lock_pool (idempotent)
    // ------------------------------
    const poolId = round.suiPoolAddress;
    if (!poolId) {
      throw new BusinessRuleError('ROUND_DATA_MISSING', 'Missing suiPoolAddress for lockRound', {
        roundId: round.id,
      });
    }

    let lockPoolTxDigest = round.suiLockPoolTxDigest ?? undefined;
    if (!lockPoolTxDigest) {
      const res = await lockPool(poolId);
      lockPoolTxDigest = res.txDigest;

      await this.repository.updateById(round.id, {
        suiLockPoolTxDigest: lockPoolTxDigest,
      });
    }

    cronLogger.info('[Job 3] Transitioning to BETTING_LOCKED', {
      roundId: round.id,
    });
    const lockedRound = await transitionRoundStatus(round.id, 'BETTING_LOCKED', {
      bettingLockedAt: Date.now(),
      suiLockPoolTxDigest: lockPoolTxDigest,
    });

    cronLogger.info('[Job 3] Success', {
      roundId: lockedRound.id,
      status: lockedRound.status,
    });

    return {
      status: 'locked',
      round: lockedRound,
    };
  }

  async finalizeRound(endPriceData: PriceData): Promise<FinalizeRoundResult> {
    const jobStartTime = Date.now();
    cronLogger.info('[Job 4] Starting', { jobStartTime });

    try {
      // 가장 최근 BETTING_LOCKED 라운드 1개 찾기
      const round = await this.repository.findLatestByStatus('BETTING_LOCKED');
      if (!round) {
        cronLogger.info('[Job 4] No locked round found');
        return { status: 'no_round', message: 'No locked round found' };
      }

      cronLogger.info('[Job 4] Found round', {
        roundId: round.id,
        roundNumber: round.roundNumber,
        endTime: new Date(round.endTime).toISOString(),
        now: new Date(Date.now()).toISOString(),
      });

      // 시간 조건
      const now = Date.now();
      if (round.endTime > now) {
        cronLogger.info('[Job 4] Round not ready to finalize yet', {
          roundId: round.id,
          endTime: new Date(round.endTime).toISOString(),
          now: new Date(now).toISOString(),
        });
        return { status: 'not_ready', round, message: 'Round not ready to finalize yet' };
      }

      // 필수 필드 검증 (fail fast)
      const missingFields: string[] = [];
      if (!round.goldStartPrice) missingFields.push('goldStartPrice');
      if (!round.btcStartPrice) missingFields.push('btcStartPrice');
      if (round.totalPool === null || round.totalPool === undefined)
        missingFields.push('totalPool');
      if (round.totalGoldBets === null || round.totalGoldBets === undefined) {
        missingFields.push('totalGoldBets');
      }
      if (round.totalBtcBets === null || round.totalBtcBets === undefined) {
        missingFields.push('totalBtcBets');
      }

      if (missingFields.length > 0) {
        throw new BusinessRuleError('ROUND_DATA_MISSING', 'Missing required round fields', {
          roundId: round.id,
          missing: missingFields,
        });
      }

      if (!round.suiPoolAddress) {
        throw new BusinessRuleError(
          'ROUND_DATA_MISSING',
          'Missing suiPoolAddress for finalizeRound',
          {
            roundId: round.id,
          },
        );
      }

      const goldStart = parseFloat(round.goldStartPrice!);
      const btcStart = parseFloat(round.btcStartPrice!);
      if (
        !Number.isFinite(goldStart) ||
        goldStart <= 0 ||
        !Number.isFinite(btcStart) ||
        btcStart <= 0
      ) {
        throw new BusinessRuleError('ROUND_DATA_INVALID', 'Invalid start prices', {
          roundId: round.id,
          goldStartPrice: round.goldStartPrice,
          btcStartPrice: round.btcStartPrice,
        });
      }

      // ---------------------------------------------
      // End price snapshot (invalid -> fallback + VOID)
      // ---------------------------------------------
      const isValidPrice = (v: number) => Number.isFinite(v) && v > 0;
      let goldEnd = endPriceData.gold;
      let btcEnd = endPriceData.btc;
      let endPriceIsFallback = false;
      let endPriceFallbackReason: string | undefined;
      if (!isValidPrice(goldEnd) || !isValidPrice(btcEnd)) {
        endPriceIsFallback = true;
        endPriceFallbackReason = 'INVALID_OR_MISSING_END_PRICE';
        if (!isValidPrice(goldEnd)) goldEnd = goldStart;
        if (!isValidPrice(btcEnd)) btcEnd = btcStart;
      }

      const goldChangePercent = ((goldEnd - goldStart) / goldStart) * 100;
      const btcChangePercent = ((btcEnd - btcStart) / btcStart) * 100;

      // ---------------------------------------------
      // avgVol (30d, 1h candles, returns stddev)
      // ---------------------------------------------
      const avgVolResult = await calculateSettlementAvgVol();
      let goldAvgVol = avgVolResult.goldAvgVol;
      let btcAvgVol = avgVolResult.btcAvgVol;
      const avgVolMetaObj: unknown = avgVolResult.meta;

      // 가격 fallback인 경우 무조건 VOID로 만들기 위해 avgVol=0 강제
      if (endPriceIsFallback) {
        goldAvgVol = 0;
        btcAvgVol = 0;
      }

      // winner는 on-chain 산식과 동일하게(정규화 강도 비교) 계산
      // abs(gReturn) * btcAvgVol >= abs(bReturn) * goldAvgVol → GOLD 승 (동점 시 GOLD)
      const goldAbsReturn = Math.abs((goldEnd - goldStart) / goldStart);
      const btcAbsReturn = Math.abs((btcEnd - btcStart) / btcStart);
      const goldScore = goldAbsReturn * btcAvgVol;
      const btcScore = btcAbsReturn * goldAvgVol;
      const winner = goldScore >= btcScore ? 'GOLD' : 'BTC';

      // VOID 조건 (Move 정책과 정합)
      const winningPool = winner === 'GOLD' ? round.totalGoldBets! : round.totalBtcBets!;
      const isVoid =
        goldAvgVol === 0 || btcAvgVol === 0 || (round.totalPool! > 0 && winningPool === 0);

      cronLogger.info('[Job 4] Inputs prepared', {
        roundId: round.id,
        goldStart,
        goldEnd,
        btcStart,
        btcEnd,
        goldAvgVol,
        btcAvgVol,
        winner,
        isVoid,
        endPriceIsFallback,
        endPriceFallbackReason,
      });

      // 배당 계산
      const payoutResult: CalculatePayoutResult = calculatePayout({
        winner,
        totalPool: round.totalPool!,
        totalGoldBets: round.totalGoldBets!,
        totalBtcBets: round.totalBtcBets!,
        platformFeeRate: 0.05,
      });

      cronLogger.info('[Job 4] Payout calculated', {
        roundId: round.id,
        payoutResult,
      });

      // priceSnapshotMeta 병합 (start + end)
      const safeJsonParse = (text: string): unknown => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      };
      const prevMeta = round.priceSnapshotMeta ? safeJsonParse(round.priceSnapshotMeta) : undefined;
      const mergedPriceSnapshotMeta = JSON.stringify({
        start: prevMeta,
        end: endPriceData.meta !== undefined ? toJSON(endPriceData.meta) : undefined,
      });

      const avgVolMetaJson = toJSON(avgVolMetaObj);
      const avgVolMetaRecord: Record<string, unknown> =
        avgVolMetaJson !== null &&
        typeof avgVolMetaJson === 'object' &&
        !Array.isArray(avgVolMetaJson)
          ? (avgVolMetaJson as Record<string, unknown>)
          : { value: avgVolMetaJson };

      const avgVolMeta = JSON.stringify({
        ...avgVolMetaRecord,
        forcedVoid: endPriceIsFallback ? true : undefined,
        forcedVoidReason: endPriceFallbackReason,
      });

      // ------------------------------
      // Sui-first: finalize_round (idempotent)
      // ------------------------------
      let suiFinalizeTxDigest = round.suiFinalizeTxDigest ?? undefined;
      let suiSettlementObjectId = round.suiSettlementObjectId ?? undefined;
      let suiFeeCoinObjectId = round.suiFeeCoinObjectId ?? undefined;

      if (!suiFinalizeTxDigest || !suiSettlementObjectId || !suiFeeCoinObjectId) {
        const res = await finalizeRoundOnChain(
          round.suiPoolAddress,
          { goldStart, goldEnd, btcStart, btcEnd },
          { goldAvgVol, btcAvgVol },
          {
            ...avgVolMetaRecord,
            endPriceSource: endPriceData.source,
            endPriceTimestamp: endPriceData.timestamp,
            endPriceIsFallback,
            endPriceFallbackReason,
            endPriceMeta: endPriceData.meta !== undefined ? toJSON(endPriceData.meta) : undefined,
          },
        );

        suiFinalizeTxDigest = res.txDigest;
        suiSettlementObjectId = res.settlementId;
        suiFeeCoinObjectId = res.feeCoinId;

        // txDigest/objectId를 먼저 저장 (Sui-first)
        await this.repository.updateById(round.id, {
          suiFinalizeTxDigest,
          suiSettlementObjectId,
          suiFeeCoinObjectId,
        });
      }

      // 상태 전이 (BETTING_LOCKED → CALCULATING)
      await transitionRoundStatus(round.id, 'CALCULATING', {
        roundEndedAt: Date.now(),
        goldEndPrice: goldEnd.toString(),
        btcEndPrice: btcEnd.toString(),
        priceSnapshotEndAt: endPriceData.timestamp,
        endPriceSource: endPriceData.source,
        endPriceIsFallback,
        endPriceFallbackReason,
        priceSnapshotMeta: mergedPriceSnapshotMeta,
        goldAvgVol,
        btcAvgVol,
        avgVolMeta,
        winner,
        goldChangePercent: goldChangePercent.toString(),
        btcChangePercent: btcChangePercent.toString(),
        payoutPool: payoutResult.payoutPool,
      });

      cronLogger.info('[Job 4] Transitioned to CALCULATING', {
        roundId: round.id,
      });

      // CALCULATING → SETTLED/VOIDED (claim-ready)
      const settlementCompletedAt = Date.now();
      const finalizedRound = isVoid
        ? await transitionRoundStatus(round.id, 'VOIDED', {
            settlementCompletedAt,
            suiFinalizeTxDigest,
            suiSettlementObjectId,
            suiFeeCoinObjectId,
            platformFeeCollected: 0,
          })
        : await transitionRoundStatus(round.id, 'SETTLED', {
            settlementCompletedAt,
            suiFinalizeTxDigest,
            suiSettlementObjectId,
            suiFeeCoinObjectId,
            platformFeeCollected: payoutResult.platformFee,
          });

      const jobDuration = Date.now() - jobStartTime;
      cronLogger.info('[Job 4] Completed', {
        roundId: round.id,
        roundNumber: round.roundNumber,
        winner,
        isVoid,
        durationMs: jobDuration,
      });

      return {
        status: 'finalized',
        round: finalizedRound,
        message: isVoid ? 'Finalized as VOID (refund via claim)' : undefined,
      };
    } catch (error) {
      const jobDuration = Date.now() - jobStartTime;
      cronLogger.error('[Job 4] Failed', {
        durationMs: jobDuration,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ServiceError || error instanceof BusinessRuleError) {
        throw error;
      }

      throw new ServiceError('INTERNAL_ERROR', 'Failed to finalize round', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async settleRound(roundId: string): Promise<SettleRoundResult> {
    throw new BusinessRuleError(
      'DEPRECATED_JOB',
      'Job 5 (server-side payout settlement) is deprecated. Use user claim model (prepare/execute + claim_payout).',
      { roundId },
    );
  }

  /**
   * Recovery Job 메인 로직 (Job 6)
   *
   * 단순하게:
   * 1. stuck 라운드 찾기 (CALCULATING + 10분 이상)
   * 2. 각각에 대해 settleRound() 호출 또는 알림
   * 3. 숫자만 반환
   *
   * @returns RecoveryRoundsResult - stuckCount, retriedCount, alertedCount
   */
  async recoveryRounds(): Promise<RecoveryRoundsResult> {
    // 결정 B(2025-12-15): Job 5/6 범위는 다음 스코프로 미룸 (claim 모델 전환 후 복구 설계)
    // - scheduled handler가 매분 호출하므로, 당장은 "noop + 200"로 유지한다.
    cronLogger.info('[Job 6] Recovery deferred (claim model migration). Returning noop result.');
    return { stuckCount: 0, retriedCount: 0, alertedCount: 0 };
  }

  /**
   * CALCULATING 상태 + roundEndedAt이 threshold 이전인 라운드 찾기
   *
   * @returns stuck 라운드 배열
   */
  async findStuckCalculatingRounds(): Promise<Round[]> {
    const threshold = Date.now() - RETRY_START_THRESHOLD_MS;
    return this.repository.findStuckCalculatingRounds(threshold);
  }

  /**
   * 초를 MM:SS 형식으로 변환
   * @private
   */
  private formatTimeMMSS(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * KST 02/08/14/20시 슬롯을 기준으로 다음 시작 시각을 계산
   */
  private getNextAnchoredStartTime(nowMs: number): number {
    const intervalMs = ROUND_DURATIONS_MS['6HOUR']; // 6시간
    const anchorOffsetMs = 5 * 60 * 60 * 1000; // 05:00 UTC == 14:00 KST → hour % 6 === 5
    const slots = Math.ceil((nowMs - anchorOffsetMs) / intervalMs);
    return slots * intervalMs + anchorOffsetMs;
  }
}
