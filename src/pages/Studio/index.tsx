import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Header } from './components/Header';
import { ChatStream } from './components/ChatPane/ChatStream';
import { ComposerToolbar } from './components/ChatPane/ComposerToolbar';
import { InputArea } from './components/ChatPane/InputArea';
import { Workspace } from './components/Workspace';
import { KeyManagerModal } from './components/Modals/KeyManagerModal';
import { db, clearAll } from '../../services/db';
import { hasAnyKey, migrateLegacyKeys } from '../../services/keys';
import { toast } from '../../lib/utils';
import { useUIStore } from '../../stores/uiStore';

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

  function onNewChat() {
    if (!confirm('新建对话会清空当前所有图像、消息和分支树。继续？')) return;
    void clearAll().then(() => {
      setActiveImage(null);
      toast('已开新对话');
    });
  }

  return (
    <div className="grid grid-rows-[64px_1fr] h-screen relative">
      <Header
        status={`${messageCount ?? 0} 条历史`}
        onOpenKeys={() => setKeyModal({ open: true, firstRun: false })}
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
