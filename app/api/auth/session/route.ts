import { NextRequest } from 'next/server';
import { fromBase64 } from '@mysten/bcs';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { registry } from '@/lib/registry';
import { ValidationError } from '@/lib/shared/errors';
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/shared/response';

/**
 * GET /api/auth/session
 * 현재 세션 정보 조회 (쿠키에서 suiAddress 읽어서 유저 정보 반환)
 */
const zkLoginGraphqlClient = new SuiGraphQLClient({
  url: 'https://graphql.testnet.sui.io/graphql',
  network: 'testnet',
});

export async function GET(request: NextRequest) {
  try {
    const suiAddress = request.cookies.get('suiAddress')?.value;

    if (!suiAddress) {
      return createSuccessResponse({ user: null });
    }

    const user = await registry.userRepository.findBySuiAddress(suiAddress);

    if (!user) {
      return createSuccessResponse({ user: null });
    }

    // 로그인된 사용자의 활동 시간 업데이트 (출석보상 대상자로 포함시키기 위해)
    // updatedAt이 1분 이상 지났을 때만 업데이트 (과도한 DB 업데이트 방지)
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    if (user.updatedAt < oneMinuteAgo) {
      await registry.userRepository.updateActivityTime(user.id);
      // 업데이트된 사용자 정보 다시 조회
      const updatedUser = await registry.userRepository.findById(user.id);
      if (updatedUser) {
        return createSuccessResponse({ user: updatedUser });
      }
    }

    return createSuccessResponse({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/auth/session
 * 지갑 연결 및 세션 생성
 */
export async function POST(request: NextRequest) {
  try {
    const { suiAddress, signature, message, signedMessageBytes } = await request.json();

    if (!suiAddress || typeof suiAddress !== 'string') {
      return createErrorResponse(400, 'INVALID_INPUT', 'suiAddress is required');
    }
    if (!signature || typeof signature !== 'string' || !message || typeof message !== 'string') {
      return createErrorResponse(400, 'INVALID_INPUT', 'signature and message are required');
    }

    const { nonce, exp } = parseLoginMessage(message);
    let messageBytes: Uint8Array;
    if (signedMessageBytes && typeof signedMessageBytes === 'string') {
      try {
        messageBytes = fromBase64(signedMessageBytes);
      } catch (err) {
        throw new ValidationError('서명 메시지 디코드에 실패했습니다.', (err as Error).message);
      }
    } else {
      messageBytes = new TextEncoder().encode(message);
    }
    console.info('[auth/session] parsed login message', {
      suiAddress,
      nonce,
      exp,
      now: Date.now(),
      sigLen: signature.length,
      sigPreview: previewValue(signature),
      msgPreview: previewValue(message),
      msgLines: previewLines(message),
      msgBytesLen: messageBytes.length,
    });

    if (Date.now() > exp) {
      return createErrorResponse(401, 'MESSAGE_EXPIRED', '로그인 서명이 만료되었습니다.');
    }

    const normalizedSignature = normalizeSerializedSignature(signature);
    console.info('[auth/session] normalized signature', {
      suiAddress,
      sigLen: signature.length,
      sigPreview: previewValue(signature),
      normalizedSigLen: normalizedSignature.length,
      normalizedSigPreview: previewValue(normalizedSignature),
    });
    try {
      const decoded = Buffer.from(normalizedSignature, 'base64');
      console.info('[auth/session] signature base64 decode ok', {
        decodedLen: decoded.length,
        head: decoded.slice(0, 8).toString('hex'),
        tail: decoded.slice(-8).toString('hex'),
      });
    } catch (decodeErr) {
      console.error('[auth/session] base64 decode failed', decodeErr);
    }

    try {
      await verifyPersonalMessageSignature(messageBytes, normalizedSignature, {
        address: suiAddress,
        client: zkLoginGraphqlClient,
      });
    } catch (err) {
      console.error('[auth/session] signature verify failed', {
        suiAddress,
        nonce,
        exp,
        sigPreview: previewValue(signature),
        normalizedSigPreview: previewValue(normalizedSignature),
        message: err instanceof Error ? err.message : err,
      });
      if (err instanceof Error && err.message?.includes('decoded')) {
        throw new ValidationError('서명 디코드에 실패했습니다.', err.message);
      }
      throw err;
    }

    // TODO: nonce 재사용 방지 및 서명 로그 적재
    void nonce;

    // 1. 유저 조회 또는 생성
    const user = await registry.userService.findOrCreateUser(suiAddress);

    // 1-1. 로그인 시 활동 시간 업데이트 (출석보상 대상자로 포함시키기 위해)
    await registry.userRepository.updateActivityTime(user.id);

    // 2. 이번 라운드 첫 로그인 보상 체크 및 지급
    const bonusResult = await registry.userService.checkAndGrantRoundLoginBonus(user.id);

    // 3. 보상 지급 후 최신 유저 정보 조회 (잔액 업데이트 반영)
    const updatedUser = bonusResult.granted
      ? await registry.userRepository.findById(user.id)
      : user;

    // 4. 쿠키에 suiAddress 저장
    const response = createSuccessResponse({
      user: updatedUser || user,
      loginBonus: bonusResult.granted
        ? { granted: true, amount: 5000, roundId: bonusResult.roundId }
        : { granted: false },
    });
    response.cookies.set('suiAddress', suiAddress, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7일
      path: '/',
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

function normalizeSerializedSignature(signature: unknown): string {
  // string 입력 처리
  if (typeof signature === 'string') {
    const trimmed = signature.trim();
    const cleaned = trimmed.replace(/\s+/g, '');

    // 1) hex → base64 변환
    if (cleaned.startsWith('0x') || /^[0-9a-fA-F]+$/.test(cleaned)) {
      const hex = cleaned.startsWith('0x') ? cleaned.slice(2) : cleaned;
      if (hex.length === 0) {
        throw new ValidationError('잘못된 서명 형식입니다.');
      }
      return Buffer.from(hex, 'hex').toString('base64');
    }

    // 2) base64 검증 후 사용
    if (isValidBase64(cleaned)) {
      return cleaned;
    }

    throw new ValidationError('잘못된 서명 형식입니다.');
  }

  // Uint8Array 또는 number[] → base64
  if (signature instanceof Uint8Array) {
    return Buffer.from(signature).toString('base64');
  }
  if (Array.isArray(signature)) {
    return Buffer.from(new Uint8Array(signature)).toString('base64');
  }

  throw new ValidationError('서명 데이터가 올바르지 않습니다.');
}

function isValidBase64(value: string): boolean {
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!base64Regex.test(value) || value.length % 4 !== 0) {
    return false;
  }
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length > 0;
  } catch {
    return false;
  }
}

const LOGIN_TITLE = 'DeltaX Login';
const EXP_PREFIX = 'Exp:';
const NONCE_PREFIX = 'Nonce:';
const MAX_CLOCK_SKEW_MS = 30_000; // 30초 허용 오차

function previewValue(value: string, keep = 24): string {
  return value.length > keep ? `${value.slice(0, keep)}...` : value;
}

function previewLines(value: string, maxLines = 3): string[] {
  const lines = value.split('\n');
  const sliced = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    sliced.push('...(+ more lines)');
  }
  return sliced;
}

function parseLoginMessage(message: string) {
  const lines = message.split('\n').map((line) => line.trim());
  if (!lines[0] || lines[0] !== LOGIN_TITLE) {
    throw new ValidationError('잘못된 로그인 메시지입니다.');
  }

  const nonceLine = lines.find((line) => line.startsWith(NONCE_PREFIX));
  const expLine = lines.find((line) => line.startsWith(EXP_PREFIX));

  if (!nonceLine || !expLine) {
    throw new ValidationError('로그인 메시지 포맷이 올바르지 않습니다.');
  }

  const nonce = nonceLine.replace(NONCE_PREFIX, '').trim();
  const exp = Number(expLine.replace(EXP_PREFIX, '').trim());

  if (!nonce || Number.isNaN(exp)) {
    throw new ValidationError('로그인 메시지 파싱에 실패했습니다.');
  }

  const now = Date.now() - MAX_CLOCK_SKEW_MS;
  if (exp < now) {
    throw new ValidationError('로그인 메시지가 이미 만료되었습니다.');
  }

  return { nonce, exp };
}
