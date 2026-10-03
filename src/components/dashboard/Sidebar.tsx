"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ProfilePanel, { UserProfile } from "./ProfilePanel";
import type { View } from "./DashboardShell";

type MenuItem = {
  id: View;
  label: string;
  icon: React.ReactNode;
};

const mainMenu: MenuItem[] = [
  {
    id: "recent",
    label: "최근",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "all",
    label: "전체",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    id: "mine",
    label: "내가 만든",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    id: "shared",
    label: "공유받은",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
    ),
  },
  {
    id: "ongoing",
    label: "진행중",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "ended",
    label: "종료된",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const ideaMenu: MenuItem[] = [
  {
    id: "ideation",
    label: "아이디어 구상",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
];

const utilMenu: MenuItem[] = [
  {
    id: "trash",
    label: "휴지통",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
  },
];

function NavButton({
  item,
  active,
  onClick,
}: {
  item: MenuItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[16px] font-medium transition-colors ${
          active
            ? "bg-red-50 text-red-600"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        }`}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-red-600" />
        )}
        {item.icon}
        {item.label}
      </button>
    </li>
  );
}

export default function Sidebar({
  profile,
  view,
  onViewChange,
  onNewItem,
}: {
  profile: UserProfile;
  view: View;
  onViewChange: (v: View) => void;
  onNewItem?: (type: "folder" | "lesson") => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<UserProfile>(profile);
  const menuRef = useRef<HTMLDivElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const initials = (currentProfile.display_name || currentProfile.email)
    .charAt(0)
    .toUpperCase();

  // 프로필 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // 신규 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!newMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [newMenuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleOpenEdit = () => {
    setMenuOpen(false);
    setEditOpen(true);
  };

  return (
    <>
      <aside
        className="flex h-full min-h-0 w-[11%] min-w-[150px] shrink-0 flex-col border-r border-gray-200 bg-white"
      >
        {/* 메뉴 */}
        <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
          {/* 신규 버튼 */}
          <div className="relative mb-4" ref={newMenuRef}>
            <button
              onClick={() => setNewMenuOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg bg-orange-500 px-3 py-2.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-orange-600"
            >
              <svg className="h-4 w-4 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              신규
            </button>
            {newMenuOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg">
                <button
                  onClick={() => { setNewMenuOpen(false); onNewItem?.("folder"); }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
                >
                  <svg className="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  새 폴더
                </button>
                <button
                  onClick={() => { setNewMenuOpen(false); onNewItem?.("lesson"); }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
                >
                  <svg className="h-4 w-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  새 프로젝트
                </button>
              </div>
            )}
          </div>

          <ul className="space-y-1.5">
            {mainMenu.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={view === item.id}
                onClick={() => onViewChange(item.id)}
              />
            ))}
          </ul>

          {/* 구분선 */}
          <div className="my-4 border-t border-gray-200" />

          <ul className="space-y-1.5">
            {ideaMenu.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={view === item.id}
                onClick={() => onViewChange(item.id)}
              />
            ))}
          </ul>

          {/* 구분선 */}
          <div className="my-4 border-t border-gray-200" />

          <ul className="space-y-1.5">
            {utilMenu.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={view === item.id}
                onClick={() => onViewChange(item.id)}
              />
            ))}
          </ul>
        </nav>

        {/* 사용자 프로필 */}
        <div className="relative border-t border-gray-200 p-3" ref={menuRef}>
          {/* 드롭다운 메뉴 */}
          {menuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 rounded-xl border border-gray-200 bg-white shadow-lg">
              {/* 이메일 */}
              <div className="border-b border-gray-100 px-3 py-2.5">
                <p className="truncate text-[16px] text-gray-400">{currentProfile.email}</p>
              </div>
              {/* 메뉴 항목 */}
              <div className="p-1">
                <button
                  onClick={handleOpenEdit}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[18px] text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  프로필 설정
                </button>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[18px] text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  로그아웃
                </button>
              </div>
            </div>
          )}

          {/* 프로필 버튼 */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-100"
          >
            {currentProfile.avatar_url ? (
              <img
                src={currentProfile.avatar_url}
                alt="프로필"
                className="h-8 w-8 flex-shrink-0 rounded-full object-cover ring-1 ring-gray-200"
              />
            ) : (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-semibold text-red-600">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[16px] font-medium text-gray-800">
                {currentProfile.display_name || currentProfile.email}
              </p>
              {currentProfile.school && (
                <p className="truncate text-[16px] text-gray-400">
                  {currentProfile.school}
                </p>
              )}
              {currentProfile.subject && !currentProfile.school && (
                <p className="truncate text-[16px] text-gray-400">
                  {currentProfile.subject}
                </p>
              )}
            </div>
          </button>
        </div>
      </aside>

      {editOpen && (
        <ProfilePanel
          profile={currentProfile}
          onClose={() => setEditOpen(false)}
          onSave={(updated) => {
            setCurrentProfile(updated);
            setEditOpen(false);
          }}
        />
      )}
    </>
  );
}
