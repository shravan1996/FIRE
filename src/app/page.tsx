"use client";

import { useState, useEffect } from "react";
import { ProfileSetup } from "@/components/profile-setup";
import { ChatPanel } from "@/components/chat-panel";
import { DocumentUploadPage } from "@/components/document-upload-page";
import { Flame } from "lucide-react";

const STORAGE_KEY = "fire_user_id";
const NAME_KEY = "fire_user_name";
const DOCS_KEY = "fire_docs_seen";

type Session = {
  userId: string | null;
  userName: string;
  docsSeen: boolean;
  ready: boolean;
};

export default function HomePage() {
  const [session, setSession] = useState<Session>({
    userId: null,
    userName: "",
    docsSeen: false,
    ready: false,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const stored   = localStorage.getItem(STORAGE_KEY);
      const name     = localStorage.getItem(NAME_KEY);
      const docsSeen = localStorage.getItem(DOCS_KEY) === "1";
      setSession({
        userId:   stored && name ? stored : null,
        userName: stored && name ? name   : "",
        docsSeen,
        ready: true,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function handleProfileCreated(id: string) {
    fetch(`/api/profile?userId=${id}`)
      .then((r) => r.json())
      .then((data) => {
        const name = data.profile?.name ?? "there";
        localStorage.setItem(STORAGE_KEY, id);
        localStorage.setItem(NAME_KEY, name);
        localStorage.removeItem(DOCS_KEY);
        setSession({ userId: id, userName: name, docsSeen: false, ready: true });
      });
  }

  function handleDocsContinue() {
    localStorage.setItem(DOCS_KEY, "1");
    setSession((prev) => ({ ...prev, docsSeen: true }));
  }

  function handleBack() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(DOCS_KEY);
    setSession({ userId: null, userName: "", docsSeen: false, ready: true });
  }

  if (!session.ready) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 rounded-lg bg-[#003d5c] flex items-center justify-center animate-pulse">
          <Flame className="w-5 h-5 text-[#ffcd00]" />
        </div>
      </div>
    );
  }

  if (!session.userId) {
    return <ProfileSetup onComplete={handleProfileCreated} />;
  }

  if (!session.docsSeen) {
    return (
      <DocumentUploadPage
        userId={session.userId}
        userName={session.userName}
        onContinue={handleDocsContinue}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="h-screen bg-[#f7f9fc] flex flex-col overflow-hidden">
      <div className="flex-1 max-w-3xl mx-auto w-full flex flex-col min-h-0 bg-white border-x border-[#e4e9ef]">
        <ChatPanel userId={session.userId} userName={session.userName} onBack={handleBack} />
      </div>
    </div>
  );
}
