import { createSuccessResponse, handleApiError } from '@/lib/shared/response';
import { registry } from '@/lib/registry';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = await registry.suiService.executeBetTransaction(body);

    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
