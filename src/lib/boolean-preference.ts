"use client";

export const BOOLEAN_PREFERENCE_EVENT = "tf:boolean-preference-change";

type BooleanPreferenceDetail = {
  key: string;
  value: boolean;
};

export function readBooleanPreference(key: string): boolean | null {
  // The cookie is also the SSR value and stays current when Storage writes fail.
  try {
    const stored = document.cookie.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${key}=`))
      ?.slice(key.length + 1);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // Cookieを使えない場合は、既存のStorage設定を読む。
  }
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // どちらも使えない場合は、呼出元のSSR初期値を維持する。
  }
  return null;
}

export function writeBooleanPreference(key: string, value: boolean) {
  document.cookie = [
    `${key}=${value ? "1" : "0"}`,
    "path=/",
    "max-age=31536000",
    "samesite=lax",
  ].join(";");

  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Cookieへの保存は完了しているため、そのまま続行する。
  }

  window.dispatchEvent(
    new CustomEvent<BooleanPreferenceDetail>(BOOLEAN_PREFERENCE_EVENT, {
      detail: { key, value },
    }),
  );
}

export function isBooleanPreferenceEvent(
  event: Event,
  key: string,
): event is CustomEvent<BooleanPreferenceDetail> {
  return (
    event instanceof CustomEvent &&
    event.detail?.key === key &&
    typeof event.detail.value === "boolean"
  );
}
