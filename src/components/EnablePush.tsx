"use client";

/**
 * Turn on phone/desktop notifications: permission → push subscription →
 * saved server-side. Requires the service worker, which registers in
 * production (or the installed PWA) — in dev this explains itself instead.
 */
import { useEffect, useState, useTransition } from "react";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/app/actions";
import { showToast } from "@/components/InstantAction";

function vapidKeyBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

export function EnablePush({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<
    "checking" | "unsupported" | "no-sw" | "off" | "on"
  >("checking");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidPublicKey) {
        setState("unsupported");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setState("no-sw");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, [vapidPublicKey]);

  const enable = () =>
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          showToast("Notifications stay off until you allow them in the browser prompt.");
          return;
        }
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBuffer(vapidPublicKey),
        });
        const json = sub.toJSON();
        const fd = new FormData();
        fd.append("endpoint", sub.endpoint);
        fd.append("p256dh", json.keys?.p256dh ?? "");
        fd.append("auth", json.keys?.auth ?? "");
        await savePushSubscription(fd);
        setState("on");
        showToast("Notifications on for this device 🔔");
      } catch {
        showToast("Couldn't subscribe — try again from the installed app.");
      }
    });

  const disable = () =>
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const fd = new FormData();
        fd.append("endpoint", sub.endpoint);
        await removePushSubscription(fd);
        await sub.unsubscribe();
      }
      setState("off");
      showToast("Notifications off for this device.");
    });

  const test = () =>
    startTransition(async () => {
      const r = await sendTestPush();
      showToast(
        r.total === 0
          ? "No devices subscribed yet."
          : `Sent to ${r.delivered} of ${r.total} device${r.total === 1 ? "" : "s"}.`,
      );
    });

  if (state === "checking") return null;
  if (state === "unsupported") {
    return (
      <p className="text-sm text-slate-500">
        This browser doesn&apos;t support web push (or keys aren&apos;t set).
      </p>
    );
  }
  if (state === "no-sw") {
    return (
      <p className="text-sm text-slate-500">
        Notifications need the installed app — use the production site (or
        &ldquo;Add to Home Screen&rdquo; on your phone), then come back here.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === "off" ? (
        <button
          onClick={enable}
          disabled={pending}
          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          Turn on notifications 🔔
        </button>
      ) : (
        <>
          <span className="text-sm text-emerald-300">On for this device 🔔</span>
          <button
            onClick={test}
            disabled={pending}
            className="text-xs text-sky-300 transition hover:text-sky-200"
          >
            send a test
          </button>
          <button
            onClick={disable}
            disabled={pending}
            className="text-xs text-slate-500 transition hover:text-red-400"
          >
            turn off
          </button>
        </>
      )}
    </div>
  );
}
