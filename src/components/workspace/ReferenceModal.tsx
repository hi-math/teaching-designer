"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "lesson-files";

type FileItem = {
  name: string;
  id: string;
  created_at: string;
  metadata: { size: number; mimetype: string; lastModified?: string } | null;
};

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function FileTypeIcon({ mime }: { mime?: string }) {
  if (!mime) return <GenericIcon />;
  if (mime.startsWith("image/")) return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
  if (mime.includes("pdf")) return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );
  if (mime.includes("word") || mime.includes("document")) return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M3 14h18M10 3v18M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
      </svg>
    </div>
  );
  if (mime.includes("presentation") || mime.includes("powerpoint")) return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    </div>
  );
  return <GenericIcon />;
}

function GenericIcon() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f4f9] text-[#757b82]">
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
    </div>
  );
}

export default function ReferenceModal({
  lessonId,
  onClose,
  onFilesChange,
}: {
  lessonId: string;
  onClose: () => void;
  onFilesChange?: () => void;
}) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.storage
      .from(BUCKET)
      .list(lessonId, { sortBy: { column: "created_at", order: "desc" } });
    if (err) { setError(err.message); setLoading(false); return; }
    setFiles((data ?? []).filter((f) => f.name !== ".emptyFolderPlaceholder") as FileItem[]);
    setLoading(false);
  }, [lessonId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    for (const file of Array.from(fileList)) {
      setUploadProgress(`업로드 중: ${file.name}`);
      const path = `${lessonId}/${file.name}`;
      const { error: err } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true });
      if (err) { setError(`업로드 실패: ${err.message}`); }
    }
    setUploadProgress(null);
    setUploading(false);
    loadFiles();
    onFilesChange?.();
  };

  const handleDownload = async (name: string) => {
    const supabase = createClient();
    const { data, error: err } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(`${lessonId}/${name}`, 120);
    if (err || !data?.signedUrl) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.target = "_blank";
    a.click();
  };

  const handleDelete = async (name: string) => {
    const supabase = createClient();
    await supabase.storage.from(BUCKET).remove([`${lessonId}/${name}`]);
    setDeleteConfirm(null);
    loadFiles();
    onFilesChange?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex w-[580px] max-h-[80vh] flex-col rounded-2xl border border-gray-200 bg-white shadow-xl">

        {/* 삭제 확인 */}
        {deleteConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/20">
            <div className="w-[320px] rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
              <p className="mb-1 text-[15px] font-semibold text-gray-900">파일 삭제</p>
              <p className="mb-1 truncate text-[13px] text-[#5a6066]">{deleteConfirm}</p>
              <p className="mb-4 text-[13px] text-red-500">삭제된 파일은 복구할 수 없습니다.</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-lg border border-gray-200 py-2 text-[13px] text-[#757b82] transition hover:bg-gray-50">취소</button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 rounded-lg bg-red-500 py-2 text-[13px] font-semibold text-white transition hover:bg-red-600">삭제</button>
              </div>
            </div>
          </div>
        )}

        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-[#D1260F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <h2 className="text-[17px] font-semibold text-gray-900">참고자료</h2>
            {!loading && (
              <span className="rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[12px] font-medium text-[#757b82]">
                {files.length}개
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 드래그 앤 드롭 업로드 영역 */}
        <div
          onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setDragging(true); }}
          onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setDragging(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            dragCounter.current = 0;
            setDragging(false);
            handleUpload(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mx-4 mt-4 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-5 transition ${
            dragging ? "border-[#D1260F] bg-red-50" : "border-[#dde3eb] hover:border-[#D1260F]/50 hover:bg-[#FFF8F6]"
          }`}
        >
          {uploading ? (
            <>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#D1260F] border-t-transparent" />
              <p className="text-[13px] text-[#D1260F]">{uploadProgress ?? "업로드 중…"}</p>
            </>
          ) : (
            <>
              <svg className={`h-6 w-6 ${dragging ? "text-[#D1260F]" : "text-[#adb2ba]"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-[13px] text-[#757b82]">
                {dragging ? "여기에 놓으세요" : "파일을 드래그하거나 클릭하여 업로드"}
              </p>
              <p className="text-[11px] text-[#adb2ba]">최대 50MB · 모든 파일 형식</p>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }}
        />

        {/* 에러 */}
        {error && (
          <div className="mx-4 mt-3 rounded-lg bg-red-50 px-4 py-2 text-[13px] text-red-600">
            {error}
          </div>
        )}

        {/* 파일 목록 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#D1260F] border-t-transparent" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-[#adb2ba]">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <p className="text-[14px]">업로드된 파일이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {files.map((file) => (
                <div
                  key={file.id ?? file.name}
                  className="flex items-center gap-3 rounded-xl border border-[#eef0f6] bg-[#FFFAF8] px-4 py-3 transition hover:bg-[#FFF3EF]"
                >
                  <FileTypeIcon mime={file.metadata?.mimetype} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#2d3339]">{file.name}</p>
                    <p className="text-[12px] text-[#adb2ba]">
                      {formatSize(file.metadata?.size ?? 0)}
                      {file.created_at ? ` · ${formatDate(file.created_at)}` : ""}
                    </p>
                  </div>
                  {/* 다운로드 */}
                  <button
                    onClick={() => handleDownload(file.name)}
                    title="다운로드"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#adb2ba] transition hover:bg-[#FBE3DC] hover:text-[#D1260F]"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  {/* 삭제 */}
                  <button
                    onClick={() => setDeleteConfirm(file.name)}
                    title="삭제"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#adb2ba] transition hover:bg-red-50 hover:text-red-400"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
