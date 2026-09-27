"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type UserProfile = {
  id: string;
  email: string;
  display_name: string | null;
  school: string | null;
  subject: string | null;
  avatar_url: string | null;
};

export default function ProfilePanel({
  profile,
  onClose,
  onSave,
}: {
  profile: UserProfile;
  onClose: () => void;
  onSave: (updated: UserProfile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [school, setSchool] = useState(profile.school ?? "");
  const [subject, setSubject] = useState(profile.subject ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = (displayName || profile.email).charAt(0).toUpperCase();
  const displayAvatar = avatarPreview ?? avatarUrl;

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    let newAvatarUrl = avatarUrl;

    // 새 이미지가 선택된 경우 Storage에 업로드
    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${profile.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatar")
        .upload(path, avatarFile, { upsert: true });

      if (uploadError) {
        setError("이미지 업로드에 실패했습니다: " + uploadError.message);
        setSaving(false);
        return;
      }

      const { data } = supabase.storage.from("avatar").getPublicUrl(path);
      // 캐시 무효화를 위해 타임스탬프 쿼리 추가
      newAvatarUrl = `${data.publicUrl}?t=${Date.now()}`;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        display_name: displayName.trim() || null,
        school: school.trim() || null,
        subject: subject.trim() || null,
        avatar_url: newAvatarUrl,
      },
    });

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onSave({
      ...profile,
      display_name: displayName.trim() || null,
      school: school.trim() || null,
      subject: subject.trim() || null,
      avatar_url: newAvatarUrl,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">프로필 수정</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 아바타 — 클릭 시 파일 선택 */}
        <div className="mb-6 flex justify-center">
          <button
            type="button"
            onClick={handleAvatarClick}
            className="group relative"
          >
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt="프로필 사진"
                className="h-16 w-16 rounded-full object-cover ring-2 ring-red-100"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-2xl font-bold text-red-600">
                {initials}
              </div>
            )}
            {/* 호버 오버레이 */}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* 이메일 (읽기 전용) */}
        <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-center">
          <p className="text-xs text-gray-400">{profile.email}</p>
        </div>

        {/* 입력 필드 */}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">이름</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="이름을 입력하세요"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">학교</label>
            <input
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="학교명을 입력하세요"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">담당 과목</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="예) 수학, 과학"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        {/* 버튼 */}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
