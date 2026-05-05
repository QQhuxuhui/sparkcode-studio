import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Header } from './components/Header';
import { ChatStream } from './components/ChatPane/ChatStream';
import { ComposerToolbar } from './components/ChatPane/ComposerToolbar';
import { InputArea } from './components/ChatPane/InputArea';
import { Workspace } from './components/Workspace';
import { KeyManagerModal } from './components/Modals/KeyManagerModal';
import { db, clearAll, putImage } from '../../services/db';
import { hasAnyKey, migrateLegacyKeys } from '../../services/keys';
import { exportSession, importBundle } from '../../services/exporter';
import { toast, fileToDataUrl } from '../../lib/utils';
import { useUIStore } from '../../stores/uiStore';
import { useRefStore } from '../../stores/refStore';

export function Studio() {
  const [keyModal, setKeyModal] = useState<{ open: boolean; firstRun: boolean }>({
    open: false, firstRun: false,
  });
  const messageCount = useLiveQuery(() => db.messages.count(), [], 0);
  const setActiveImage = useUIStore((s) => s.setActiveImage);

  // Bootstrap: migrate legacy keys, then prompt if no keys
  useEffect(() => {
    migrateLegacyKeys();
    if (!hasAnyKey()) setKeyModal({ open: true, firstRun: true });
  }, []);

  // Page-level drag/drop — accepts image files anywhere in the page,
  // ingests them as user-uploaded refs (auto-engaged via refStore).
  useEffect(() => {
    const onDragOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = async (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      // JSON file → import flow (single only)
      const json = files.find((f) => f.type === 'application/json' || f.name.endsWith('.json'));
      if (json) {
        e.preventDefault();
        await onImportFile(json);
        return;
      }
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) return;
      e.preventDefault();
      for (const file of images) {
        const dataUrl = await fileToDataUrl(file);
        const rec = await putImage({
          dataUrl, model: '(uploaded)', prompt: '', isUserUpload: true,
          format: file.type.split('/')[1] || 'png',
        });
        useRefStore.getState().add(rec.id);
      }
      toast(`已上传 ${images.length} 张图`);
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  function onNewChat() {
    if (!confirm('新建对话会清空当前所有图像、消息和分支树。继续？')) return;
    void clearAll().then(() => {
      setActiveImage(null);
      toast('已开新对话');
    });
  }

  async function onExport() {
    try {
      await exportSession();
      toast('已导出会话');
    } catch (e) {
      toast(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function onImportFile(file: File) {
    try {
      // Show counts in confirm
      const text = await file.text();
      const probe = JSON.parse(text);
      const counts = `${probe.images?.length || 0} 张图、${probe.messages?.length || 0} 条消息、${probe.nodes?.length || 0} 个分支`;
      const exportedAt = probe.exportedAt
        ? new Date(probe.exportedAt).toLocaleString('zh-CN')
        : '未知时间';
      if (!confirm(`即将导入备份（导出于 ${exportedAt}）：${counts}。\n\n当前会话会被清空（已自动备份到本地，7 天后过期）。继续？`)) return;
      const { backupKey } = await importBundle(file);
      setActiveImage(null);
      toast('导入完成');
      console.log(`[conv-image] Import complete. Previous session backed up at localStorage[${backupKey}]`);
    } catch (e) {
      toast(`${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function onImportClick() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) void onImportFile(f);
    });
    inp.click();
  }

  return (
    <div className="grid grid-rows-[64px_1fr] h-screen relative">
      <Header
        status={`${messageCount ?? 0} 条历史`}
        onOpenKeys={() => setKeyModal({ open: true, firstRun: false })}
        onExport={() => void onExport()}
        onImport={onImportClick}
      />
      <main className="grid grid-cols-[440px_1fr] min-h-0">
        <section className="flex flex-col border-r border-border min-h-0 bg-paper-warm">
          <ChatStream />
          <ComposerToolbar onNewChat={onNewChat} />
          <InputArea />
        </section>
        <Workspace />
      </main>

      {keyModal.open && (
        <KeyManagerModal
          firstRun={keyModal.firstRun}
          onClose={() => setKeyModal({ open: false, firstRun: false })}
        />
      )}
    </div>
  );
}
