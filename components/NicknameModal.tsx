'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X, Loader2, AlertCircle } from 'lucide-react';

interface NicknameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (nickname: string) => void;
    currentNickname?: string;
}

export function NicknameModal({ isOpen, onClose, onConfirm, currentNickname }: NicknameModalProps) {
    const [nickname, setNickname] = useState('');
    const [checking, setChecking] = useState(false);
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

    // 모달이 열릴 때 초기화
    useEffect(() => {
        if (isOpen) {
            setNickname('');
            setIsAvailable(null);
            setErrorMessage('');
        }
    }, [isOpen]);

    // 닉네임 변경 시 중복 검사 (디바운스)
    useEffect(() => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        if (nickname.length < 2) {
            setIsAvailable(null);
            setErrorMessage(nickname.length > 0 ? '닉네임은 2자 이상이어야 합니다.' : '');
            return;
        }

        if (nickname.length > 20) {
            setIsAvailable(false);
            setErrorMessage('닉네임은 20자 이하여야 합니다.');
            return;
        }

        const validPattern = /^[가-힣a-zA-Z0-9_]+$/;
        if (!validPattern.test(nickname)) {
            setIsAvailable(false);
            setErrorMessage('한글, 영문, 숫자, 언더스코어만 사용 가능합니다.');
            return;
        }

        const timer = setTimeout(async () => {
            setChecking(true);
            setErrorMessage('');

            try {
                const res = await fetch(`/api/nickname/check?nickname=${encodeURIComponent(nickname)}`);
                const data = await res.json();

                if (data.success) {
                    setIsAvailable(data.data.isAvailable);
                    if (!data.data.isAvailable) {
                        setErrorMessage('이미 사용 중인 닉네임입니다.');
                    }
                } else {
                    setIsAvailable(false);
                    setErrorMessage(data.message || '닉네임 검사에 실패했습니다.');
                }
            } catch (error) {
                console.error('닉네임 검사 실패:', error);
                setErrorMessage('닉네임 검사 중 오류가 발생했습니다.');
            } finally {
                setChecking(false);
            }
        }, 500);

        setDebounceTimer(timer);

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [nickname]);

    const handleConfirm = () => {
        if (isAvailable && nickname.length >= 2) {
            onConfirm(nickname);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
                <h2 className="mb-4 text-xl font-bold text-slate-100">닉네임 설정</h2>

                {currentNickname && (
                    <p className="mb-4 text-sm text-slate-400">
                        현재 닉네임: <span className="text-cyan-400">{currentNickname}</span>
                    </p>
                )}

                <div className="relative mb-4">
                    <Input
                        type="text"
                        placeholder="새 닉네임 입력 (2~20자)"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-slate-100 pr-10"
                        maxLength={20}
                    />

                    {/* 상태 아이콘 */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {checking ? (
                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        ) : isAvailable === true ? (
                            <Check className="h-5 w-5 text-green-500" />
                        ) : isAvailable === false ? (
                            <X className="h-5 w-5 text-red-500" />
                        ) : null}
                    </div>
                </div>

                {/* 에러/성공 메시지 */}
                {errorMessage && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-red-400">
                        <AlertCircle className="h-4 w-4" />
                        {errorMessage}
                    </div>
                )}

                {isAvailable && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-green-400">
                        <Check className="h-4 w-4" />
                        사용 가능한 닉네임입니다.
                    </div>
                )}

                {/* 버튼 */}
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="flex-1 border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                    >
                        취소
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!isAvailable || checking}
                        className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500 text-white disabled:opacity-50"
                    >
                        확인
                    </Button>
                </div>
            </div>
        </div>
    );
}
