import { useEffect, useState } from "react";
import { api } from "./lib/api";
import type { Profile, StudioEvent } from "./lib/types";

export function ProfileDrawer({ profile, last, onSaved, onClose }: { profile: Profile; last: StudioEvent | null; onSaved: (p: Profile) => void; onClose: () => void }) {
  const [p, setP] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarNote, setAvatarNote] = useState("");
  useEffect(() => {
    if (!last) return;
    if (last.type === "avatar.started") {
      setAvatarBusy(true);
      setAvatarNote("generating your avatar in the background · about 20 s");
    }
    if (last.type === "avatar.ready") {
      setAvatarBusy(false);
      setAvatarNote("avatar ready");
      api.profile().then(onSaved);
    }
    if (last.type === "avatar.failed") {
      setAvatarBusy(false);
      setAvatarNote(`avatar failed · ${String(last.detail)}`);
    }
  }, [last, onSaved]);
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value });
  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveProfile({ display_name: p.display_name, description: p.description, platform_url: p.platform_url, event_code: p.event_code });
      onSaved(saved);
      setP(saved);
      if (p.description.trim() && p.description.trim() !== profile.description) setAvatarNote("generating your avatar in the background · about 20 s");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="drawer" role="dialog" aria-label="profile">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="eyebrow">You</div>
        <button className="btn ghost small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="row" style={{ gap: 14 }}>
        {profile.avatar_url ? <img className="avbig" src={profile.avatar_url} alt="your avatar" /> : <div className="avbig" />}
        <div>
          <b>{profile.display_name || "Vibe Studio creator"}</b>
          <div className="note">shown on the publish card and on the platform, with the avatar if you have one</div>
          {profile.project_id ? (
            <div className="note">
              project <span className="mono">{profile.project_id}</span> · the platform keeps one video per project and room, so a new publish replaces the earlier one
            </div>
          ) : null}
        </div>
      </div>
      <label className="f">
        <div className="eyebrow">Display name</div>
        <input className="txt" value={p.display_name} onChange={set("display_name")} placeholder="how the platform credits you" />
      </label>
      <label className="f">
        <div className="eyebrow">Describe yourself (optional)</div>
        <textarea className="txt" value={p.description} onChange={set("description")} placeholder="short dark hair, round glasses, a green hoodie, a cat on my shoulder" />
        <div className="note">Saving a new description generates an avatar from it, in the background, with a Gemini image model.</div>
      </label>
      {avatarNote && (
        <div className="note">
          {avatarBusy && <span className="spin" />} {avatarNote}
        </div>
      )}
      <label className="f">
        <div className="eyebrow">Platform</div>
        <input className="txt" value={p.platform_url} onChange={set("platform_url")} />
      </label>
      <label className="f">
        <div className="eyebrow">Event code</div>
        <input className="txt" value={p.event_code} onChange={set("event_code")} placeholder="from your instructor" />
      </label>
      <div className="note">
        Saved to <span className="mono">runs/profile.json</span>. Nothing here is sent anywhere until you publish.
      </div>
      <button className="btn" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
