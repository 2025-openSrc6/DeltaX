import { getDb } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

/**
 * GET /api/nickname/check?nickname=xxx
 * 닉네임 중복 검사 API
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const nickname = url.searchParams.get('nickname');

    if (!nickname || nickname.length < 2) {
      return Response.json(
        { error: 'INVALID_NICKNAME', message: '닉네임은 2자 이상이어야 합니다.' },
        { status: 400 },
      );
    }

    if (nickname.length > 20) {
      return Response.json(
        { error: 'INVALID_NICKNAME', message: '닉네임은 20자 이하여야 합니다.' },
        { status: 400 },
      );
    }

    // 특수문자 체크 (한글, 영문, 숫자, 언더스코어만 허용)
    const validPattern = /^[가-힣a-zA-Z0-9_]+$/;
    if (!validPattern.test(nickname)) {
      return Response.json(
        {
          error: 'INVALID_NICKNAME',
          message: '닉네임은 한글, 영문, 숫자, 언더스코어만 사용 가능합니다.',
        },
        { status: 400 },
      );
    }

    const db = getDb();

    // 중복 검사
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.nickname, nickname))
      .limit(1);

    const isAvailable = existingUser.length === 0;

    return Response.json({
      success: true,
      data: {
        nickname,
        isAvailable,
        message: isAvailable ? '사용 가능한 닉네임입니다.' : '이미 사용 중인 닉네임입니다.',
      },
    });
  } catch (error) {
    console.error('닉네임 중복 검사 실패:', error);
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: '닉네임 검사에 실패했습니다.' },
      { status: 500 },
    );
  }
}
